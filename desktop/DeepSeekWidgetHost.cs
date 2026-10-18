using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DeepSeekUsageWidgetHost
{
    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main()
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, @"Local\DeepSeekUsageWidgetHost", out createdNew))
            {
                if (!createdNew)
                {
                    return;
                }

                try
                {
                    SetProcessDPIAware();
                }
                catch
                {
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new WidgetForm());
                GC.KeepAlive(mutex);
            }
        }
    }

    internal sealed class WidgetForm : Form
    {
        private const int WindowCornerRadius = 22;
        private const string WidgetUrl = "http://127.0.0.1:4173/?widget=1&follow=1&hosted=1";
        private readonly WebView2 webView;
        private readonly string stateFile;
        private readonly System.Windows.Forms.Timer layoutTimer;
        private bool dragging;
        private bool layoutCollapsed;
        private Point dragStartScreen;
        private Point dragStartLocation;
        private Rectangle layoutStartBounds;
        private Rectangle layoutTargetBounds;
        private Stopwatch layoutAnimationClock;
        private int expandedWidth = 740;
        private int expandedHeight = 650;
        private DateTime lastBoundsSave = DateTime.MinValue;
        private const int CollapsedHeight = 118;
        private const int LayoutAnimationMilliseconds = 260;

        public WidgetForm()
        {
            Text = "DeepSeek Usage Widget";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            MinimumSize = new Size(560, 118);
            BackColor = Color.FromArgb(8, 15, 29);
            DoubleBuffered = true;

            string settingsDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DeepSeekUsageMonitor");
            Directory.CreateDirectory(settingsDirectory);
            stateFile = Path.Combine(settingsDirectory, "widget-host-bounds.txt");
            LoadInitialBounds();
            layoutCollapsed = Height < 180;
            expandedWidth = Width;
            expandedHeight = layoutCollapsed ? 650 : Height;

            webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.FromArgb(8, 15, 29)
            };
            Controls.Add(webView);

            layoutTimer = new System.Windows.Forms.Timer { Interval = 15 };
            layoutTimer.Tick += delegate { AdvanceLayoutAnimation(); };

            Load += async delegate { await InitializeWebView(); };
            Resize += delegate
            {
                ApplyRoundedRegion();
                SaveBoundsThrottled();
            };
            Move += delegate { SaveBoundsThrottled(); };
            FormClosing += delegate
            {
                layoutTimer.Stop();
                SaveBounds();
            };
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams parameters = base.CreateParams;
                parameters.ExStyle |= 0x00000080;
                return parameters;
            }
        }

        private async Task InitializeWebView()
        {
            try
            {
                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "DeepSeekUsageMonitor",
                    "webview-host");
                Directory.CreateDirectory(userDataFolder);
                CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments = "--force-device-scale-factor=1"
                };
                CoreWebView2Environment environment =
                    await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
                await webView.EnsureCoreWebView2Async(environment);
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.WebMessageReceived += HandleWebMessage;
                string configuredUrl =
                    Environment.GetEnvironmentVariable("DEEPSEEK_WIDGET_URL") ?? WidgetUrl;
                webView.CoreWebView2.Navigate(configuredUrl);
                ApplyRoundedRegion();
            }
            catch (Exception error)
            {
                MessageBox.Show(
                    this,
                    "无法启动监控窗口：" + error.Message,
                    "DeepSeek Usage Widget",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Close();
            }
        }

        private void HandleWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            string message = args.TryGetWebMessageAsString();
            if (string.IsNullOrWhiteSpace(message))
            {
                return;
            }

            string[] parts = message.Split(':');
            if (parts.Length < 3)
            {
                return;
            }

            if (parts[0] == "layout-collapsed")
            {
                AnimateWindowLayout(true);
                return;
            }
            if (parts[0] == "layout-expanded")
            {
                AnimateWindowLayout(false);
                return;
            }

            int screenX;
            int screenY;
            if (!int.TryParse(parts[1], out screenX) || !int.TryParse(parts[2], out screenY))
            {
                return;
            }

            if (parts[0] == "drag-start")
            {
                dragging = true;
                dragStartScreen = new Point(screenX, screenY);
                dragStartLocation = Location;
            }
            else if (parts[0] == "drag-move" && dragging)
            {
                MoveToSafePosition(new Point(
                    dragStartLocation.X + screenX - dragStartScreen.X,
                    dragStartLocation.Y + screenY - dragStartScreen.Y));
            }
            else if (parts[0] == "drag-end")
            {
                dragging = false;
                SaveBounds();
            }
        }

        private void AnimateWindowLayout(bool collapsed)
        {
            layoutTimer.Stop();
            if (collapsed && !layoutCollapsed)
            {
                expandedWidth = Width;
                expandedHeight = Height;
            }
            layoutCollapsed = collapsed;

            int targetWidth = collapsed
                ? Math.Max(560, Width)
                : Math.Max(560, expandedWidth);
            int targetHeight = collapsed
                ? CollapsedHeight
                : Math.Max(480, expandedHeight);
            Rectangle workingArea = Screen.FromPoint(Location).WorkingArea;
            int targetX = Math.Max(
                workingArea.Left,
                Math.Min(Location.X, workingArea.Right - targetWidth));
            int targetY = Math.Max(
                workingArea.Top,
                Math.Min(Location.Y, workingArea.Bottom - targetHeight));

            layoutStartBounds = Bounds;
            layoutTargetBounds = new Rectangle(
                targetX,
                targetY,
                targetWidth,
                targetHeight);
            if (layoutStartBounds == layoutTargetBounds)
            {
                SaveBounds();
                return;
            }

            layoutAnimationClock = Stopwatch.StartNew();
            layoutTimer.Start();
        }

        private void AdvanceLayoutAnimation()
        {
            if (layoutAnimationClock == null)
            {
                layoutTimer.Stop();
                return;
            }

            double progress = Math.Min(
                1,
                layoutAnimationClock.Elapsed.TotalMilliseconds / LayoutAnimationMilliseconds);
            double eased = 1 - Math.Pow(1 - progress, 3);
            Bounds = new Rectangle(
                Interpolate(layoutStartBounds.X, layoutTargetBounds.X, eased),
                Interpolate(layoutStartBounds.Y, layoutTargetBounds.Y, eased),
                Interpolate(layoutStartBounds.Width, layoutTargetBounds.Width, eased),
                Interpolate(layoutStartBounds.Height, layoutTargetBounds.Height, eased));

            if (progress >= 1)
            {
                layoutTimer.Stop();
                Bounds = layoutTargetBounds;
                layoutAnimationClock = null;
                SaveBounds();
            }
        }

        private static int Interpolate(int start, int end, double progress)
        {
            return (int)Math.Round(start + (end - start) * progress);
        }

        private void MoveToSafePosition(Point target)
        {
            Rectangle workingArea = Screen.FromPoint(Cursor.Position).WorkingArea;
            int minX = workingArea.Left - Width + 90;
            int maxX = workingArea.Right - 90;
            int minY = workingArea.Top;
            int maxY = workingArea.Bottom - 42;
            Location = new Point(
                Math.Max(minX, Math.Min(maxX, target.X)),
                Math.Max(minY, Math.Min(maxY, target.Y)));
        }

        private void ApplyRoundedRegion()
        {
            if (Width <= 0 || Height <= 0)
            {
                return;
            }

            int radius = Math.Min(WindowCornerRadius, Math.Min(Width, Height) / 2);
            Rectangle bounds = new Rectangle(0, 0, Width, Height);
            using (GraphicsPath path = CreateRoundedRectangle(bounds, radius))
            {
                Region previous = Region;
                Region = new Region(path);
                if (previous != null)
                {
                    previous.Dispose();
                }
            }
        }

        private static GraphicsPath CreateRoundedRectangle(Rectangle bounds, int radius)
        {
            int diameter = radius * 2;
            GraphicsPath path = new GraphicsPath();
            path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
            path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
            path.AddArc(
                bounds.Right - diameter,
                bounds.Bottom - diameter,
                diameter,
                diameter,
                0,
                90);
            path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void LoadInitialBounds()
        {
            bool restored = false;
            try
            {
                if (File.Exists(stateFile))
                {
                    string[] parts = File.ReadAllLines(stateFile);
                    if (parts.Length >= 4)
                    {
                        int x;
                        int y;
                        int width;
                        int height;
                        if (
                            int.TryParse(parts[0], out x) &&
                            int.TryParse(parts[1], out y) &&
                            int.TryParse(parts[2], out width) &&
                            int.TryParse(parts[3], out height) &&
                            width >= MinimumSize.Width &&
                            height >= MinimumSize.Height
                        )
                        {
                            Rectangle desired = new Rectangle(x, y, width, height);
                            Rectangle intersection = Rectangle.Intersect(
                                desired,
                                SystemInformation.VirtualScreen);
                            if (intersection.Width >= 120 && intersection.Height >= 60)
                            {
                                Bounds = desired;
                                restored = true;
                            }
                        }
                    }
                }
            }
            catch
            {
            }

            if (restored)
            {
                return;
            }

            Rectangle workingArea = Screen.PrimaryScreen.WorkingArea;
            Size = new Size(740, 650);
            Location = new Point(
                workingArea.Right - Width - 80,
                workingArea.Top + 80);
        }

        private void SaveBoundsThrottled()
        {
            if ((DateTime.UtcNow - lastBoundsSave).TotalMilliseconds < 250)
            {
                return;
            }
            lastBoundsSave = DateTime.UtcNow;
            SaveBounds();
        }

        private void SaveBounds()
        {
            if (WindowState != FormWindowState.Normal || Width < 100 || Height < 60)
            {
                return;
            }

            try
            {
                File.WriteAllLines(
                    stateFile,
                    new[]
                    {
                        Location.X.ToString(),
                        Location.Y.ToString(),
                        Width.ToString(),
                        Height.ToString()
                    });
            }
            catch
            {
            }
        }
    }
}
