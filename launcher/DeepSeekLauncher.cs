using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace DeepSeekLauncher
{
    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main(string[] args)
        {
            bool quiet = HasArgument(args, "--quiet");
            bool preview = HasArgument(args, "--preview");
            bool createdNew;

            using (Mutex mutex = new Mutex(true, @"Local\DeepSeekUsageLauncher", out createdNew))
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

                if (quiet)
                {
                    LaunchResult result = LauncherEngine.Run(null);
                    if (!result.Success)
                    {
                        MessageBox.Show(
                            result.Message + Environment.NewLine + Environment.NewLine +
                            "日志目录：" + LauncherEngine.LogDirectory,
                            "DeepSeek 用量监控",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                    }
                    return;
                }

                using (SplashForm splash = new SplashForm(preview))
                {
                    Application.Run(splash);
                }
            }
        }

        private static bool HasArgument(string[] args, string expected)
        {
            if (args == null)
            {
                return false;
            }

            for (int index = 0; index < args.Length; index++)
            {
                if (string.Equals(args[index], expected, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
    }

    internal sealed class LaunchResult
    {
        public bool Success;
        public string Message;
    }

    internal static class LauncherEngine
    {
        private const string DashboardUrl = "http://127.0.0.1:4173";
        private static readonly string projectDirectory =
            Path.GetDirectoryName(Application.ExecutablePath);

        public static string ProjectDirectory
        {
            get { return projectDirectory; }
        }

        public static string LogDirectory
        {
            get { return Path.Combine(projectDirectory, "logs"); }
        }

        public static bool IsServiceRunning()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(
                    DashboardUrl + "/api/health");
                request.Proxy = null;
                request.Timeout = 900;
                request.ReadWriteTimeout = 900;
                request.KeepAlive = false;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        public static LaunchResult Run(Action<string> reportStatus)
        {
            try
            {
                bool wasRunning = IsServiceRunning();
                Report(reportStatus, wasRunning
                    ? "正在唤醒监控面板…"
                    : "正在启动本地服务…");

                string scriptPath = Path.Combine(projectDirectory, "open-dashboard.ps1");
                if (!File.Exists(scriptPath))
                {
                    return Failure("找不到启动脚本 open-dashboard.ps1。");
                }

                string trayPath = Path.Combine(projectDirectory, "DeepSeekUsageTray.exe");
                if (!File.Exists(trayPath))
                {
                    return Failure("找不到托盘启动程序 DeepSeekUsageTray.exe。");
                }

                string powerShellPath = Path.Combine(
                    Environment.SystemDirectory,
                    "WindowsPowerShell",
                    "v1.0",
                    "powershell.exe");
                if (!File.Exists(powerShellPath))
                {
                    powerShellPath = "powershell.exe";
                }

                ProcessStartInfo startInfo = new ProcessStartInfo(
                    powerShellPath,
                    "-NoProfile -NonInteractive -ExecutionPolicy Bypass " +
                    "-WindowStyle Hidden -File \"" + scriptPath + "\"");
                startInfo.WorkingDirectory = projectDirectory;
                startInfo.UseShellExecute = false;
                startInfo.CreateNoWindow = true;
                startInfo.WindowStyle = ProcessWindowStyle.Hidden;
                startInfo.RedirectStandardInput = true;

                using (Process process = new Process())
                {
                    process.StartInfo = startInfo;
                    process.Start();
                    process.StandardInput.Close();

                    bool exited = process.WaitForExit(25000);
                    if (!exited)
                    {
                        try
                        {
                            process.Kill();
                        }
                        catch
                        {
                        }
                        return Failure("启动脚本执行超时，请查看日志目录。");
                    }
                }

                Report(reportStatus, "正在打开桌面监控窗…");
                for (int attempt = 0; attempt < 25; attempt++)
                {
                    if (IsServiceRunning())
                    {
                        break;
                    }
                    Thread.Sleep(200);
                }

                if (!IsServiceRunning())
                {
                    return Failure("本地服务未能启动，请打开日志目录查看 server.err.log。");
                }

                Thread.Sleep(220);
                Report(reportStatus, "已就绪");
                return new LaunchResult
                {
                    Success = true,
                    Message = "启动完成"
                };
            }
            catch (Exception error)
            {
                return Failure("启动失败：" + error.Message);
            }
        }

        private static void Report(Action<string> reportStatus, string message)
        {
            if (reportStatus != null)
            {
                reportStatus(message);
            }
        }

        private static LaunchResult Failure(string message)
        {
            return new LaunchResult
            {
                Success = false,
                Message = message
            };
        }

    }

    internal sealed class SplashForm : Form
    {
        private readonly bool previewMode;
        private readonly DateTime startedAt;
        private readonly System.Windows.Forms.Timer animationTimer;
        private readonly System.Windows.Forms.Timer pulseTimer;
        private readonly Panel pulse;
        private readonly Label titleLabel;
        private readonly Label captionLabel;
        private readonly Label statusLabel;
        private readonly Label errorLabel;
        private readonly Button logButton;
        private readonly Button closeButton;
        private readonly Icon appIcon;
        private readonly Bitmap appIconBitmap;
        private readonly float dpiScale;
        private float fadeDirection;
        private bool finishRequested;

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(
            IntPtr hWnd,
            int message,
            IntPtr wParam,
            IntPtr lParam);

        public SplashForm(bool previewMode)
        {
            this.previewMode = previewMode;
            startedAt = DateTime.UtcNow;

            SetStyle(
                ControlStyles.AllPaintingInWmPaint |
                ControlStyles.OptimizedDoubleBuffer |
                ControlStyles.UserPaint,
                true);

            AutoScaleMode = AutoScaleMode.None;
            dpiScale = GetDpiScale();
            BackColor = Color.FromArgb(10, 14, 28);
            ClientSize = ScaleSize(400, 180, dpiScale);
            DoubleBuffered = true;
            FormBorderStyle = FormBorderStyle.None;
            KeyPreview = true;
            Opacity = 1d;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.CenterScreen;
            Text = "DeepSeek 用量监控";
            TopMost = true;

            appIconBitmap = LoadAppIcon(out appIcon);

            titleLabel = new Label();
            titleLabel.AutoSize = false;
            titleLabel.BackColor = Color.Transparent;
            titleLabel.Bounds = ScaleBounds(94, 25, 282, 31, dpiScale);
            titleLabel.Font = new Font("Microsoft YaHei UI", 13f, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(244, 249, 255);
            titleLabel.Text = "DeepSeek 用量监控";
            titleLabel.TextAlign = ContentAlignment.MiddleLeft;

            captionLabel = new Label();
            captionLabel.AutoSize = false;
            captionLabel.BackColor = Color.Transparent;
            captionLabel.Bounds = ScaleBounds(95, 56, 282, 18, dpiScale);
            captionLabel.Font = new Font("Segoe UI", 7.5f, FontStyle.Bold);
            captionLabel.ForeColor = Color.FromArgb(93, 117, 158);
            captionLabel.Text = "LOCAL USAGE MONITOR";
            captionLabel.TextAlign = ContentAlignment.MiddleLeft;

            statusLabel = new Label();
            statusLabel.AutoSize = false;
            statusLabel.BackColor = Color.Transparent;
            statusLabel.Bounds = ScaleBounds(95, 79, 282, 24, dpiScale);
            statusLabel.Font = new Font("Microsoft YaHei UI", 9f, FontStyle.Regular);
            statusLabel.ForeColor = Color.FromArgb(173, 192, 224);
            statusLabel.Text = "正在准备桌面启动器…";
            statusLabel.TextAlign = ContentAlignment.MiddleLeft;

            pulse = new Panel();
            pulse.BackColor = Color.Transparent;
            pulse.Bounds = ScaleBounds(24, 148, 352, 5, dpiScale);
            pulse.Paint += PaintPulse;

            errorLabel = new Label();
            errorLabel.AutoEllipsis = true;
            errorLabel.AutoSize = false;
            errorLabel.BackColor = Color.Transparent;
            errorLabel.Bounds = ScaleBounds(26, 112, 348, 80, dpiScale);
            errorLabel.Font = new Font("Microsoft YaHei UI", 8.5f, FontStyle.Regular);
            errorLabel.ForeColor = Color.FromArgb(255, 178, 192);
            errorLabel.TextAlign = ContentAlignment.TopLeft;
            errorLabel.Visible = false;

            logButton = CreateActionButton(
                "打开日志目录",
                ScaleBounds(24, 198, 142, 34, dpiScale));
            logButton.Click += delegate
            {
                try
                {
                    Directory.CreateDirectory(LauncherEngine.LogDirectory);
                    Process.Start("explorer.exe", LauncherEngine.LogDirectory);
                }
                catch
                {
                }
            };

            closeButton = CreateActionButton(
                "关闭",
                ScaleBounds(178, 198, 82, 34, dpiScale));
            closeButton.Click += delegate { Close(); };

            Controls.Add(titleLabel);
            Controls.Add(captionLabel);
            Controls.Add(statusLabel);
            Controls.Add(pulse);
            Controls.Add(errorLabel);
            Controls.Add(logButton);
            Controls.Add(closeButton);

            animationTimer = new System.Windows.Forms.Timer();
            animationTimer.Interval = 16;
            animationTimer.Tick += OnAnimationTick;

            pulseTimer = new System.Windows.Forms.Timer();
            pulseTimer.Interval = 30;
            pulseTimer.Tick += delegate
            {
                if (pulse.Visible)
                {
                    pulse.Invalidate();
                }
            };
            pulseTimer.Start();

            Shown += OnSplashShown;
            KeyDown += OnSplashKeyDown;
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            UpdateRoundedRegion();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);

            Graphics graphics = e.Graphics;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

            float scale = ClientSize.Width / 400f;
            float logicalHeight = ClientSize.Height / scale;
            graphics.ScaleTransform(scale, scale);

            RectangleF backgroundRect = new RectangleF(0, 0, 400, logicalHeight);
            using (LinearGradientBrush backgroundBrush = new LinearGradientBrush(
                backgroundRect,
                Color.FromArgb(255, 15, 21, 42),
                Color.FromArgb(255, 8, 11, 23),
                52f))
            {
                graphics.FillRectangle(backgroundBrush, backgroundRect);
            }

            using (GraphicsPath glowPath = new GraphicsPath())
            {
                glowPath.AddEllipse(238, -118, 310, 260);
                using (PathGradientBrush glowBrush = new PathGradientBrush(glowPath))
                {
                    glowBrush.CenterColor = Color.FromArgb(50, 86, 121, 255);
                    glowBrush.SurroundColors = new Color[]
                    {
                        Color.FromArgb(0, 86, 121, 255)
                    };
                    graphics.FillPath(glowBrush, glowPath);
                }
            }

            using (GraphicsPath iconGlowPath = new GraphicsPath())
            {
                iconGlowPath.AddEllipse(10, 18, 88, 88);
                using (PathGradientBrush iconGlowBrush = new PathGradientBrush(iconGlowPath))
                {
                    iconGlowBrush.CenterColor = Color.FromArgb(34, 113, 172, 255);
                    iconGlowBrush.SurroundColors = new Color[]
                    {
                        Color.FromArgb(0, 113, 172, 255)
                    };
                    graphics.FillPath(iconGlowBrush, iconGlowPath);
                }
            }

            if (appIconBitmap != null)
            {
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.DrawImage(
                    appIconBitmap,
                    new RectangleF(24, 33, 54, 54),
                    new RectangleF(0, 0, appIconBitmap.Width, appIconBitmap.Height),
                    GraphicsUnit.Pixel);
            }

            if (!errorLabel.Visible)
            {
                using (Pen dividerPen = new Pen(Color.FromArgb(24, 135, 166, 220), 1f))
                {
                    graphics.DrawLine(dividerPen, 24, 127, 376, 127);
                }
            }

            using (GraphicsPath borderPath = CreateRoundedRect(
                new RectangleF(0.5f, 0.5f, 399f, logicalHeight - 1f),
                18f))
            using (Pen borderPen = new Pen(Color.FromArgb(44, 143, 177, 232), 1f))
            {
                graphics.DrawPath(borderPen, borderPath);
            }
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            if (e.Button == MouseButtons.Left)
            {
                ReleaseCapture();
                SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                animationTimer.Dispose();
                pulseTimer.Dispose();
                if (appIconBitmap != null)
                {
                    appIconBitmap.Dispose();
                }
                if (appIcon != null)
                {
                    appIcon.Dispose();
                }
            }
            base.Dispose(disposing);
        }

        private void OnSplashShown(object sender, EventArgs e)
        {
            if (previewMode)
            {
                SetStatus("设计预览 · 按 Esc 关闭");
                return;
            }

            ThreadPool.QueueUserWorkItem(delegate
            {
                LaunchResult result = LauncherEngine.Run(SetStatus);
                try
                {
                    BeginInvoke(new Action(delegate
                    {
                        OnLaunchFinished(result);
                    }));
                }
                catch
                {
                }
            });
        }

        private void OnLaunchFinished(LaunchResult result)
        {
            if (IsDisposed)
            {
                return;
            }

            if (result.Success)
            {
                SetStatus("启动完成 · 正在打开监控面板");
                int elapsed = (int)(DateTime.UtcNow - startedAt).TotalMilliseconds;
                int wait = Math.Max(0, 850 - elapsed);
                System.Windows.Forms.Timer finishTimer =
                    new System.Windows.Forms.Timer();
                finishTimer.Interval = Math.Max(1, wait);
                finishTimer.Tick += delegate
                {
                    finishTimer.Stop();
                    finishTimer.Dispose();
                    BeginFadeOut();
                };
                finishTimer.Start();
                return;
            }

            ShowFailure(result.Message);
        }

        private void ShowFailure(string message)
        {
            SetStatus("启动失败");
            ClientSize = new Size(ClientSize.Width, (int)(262 * dpiScale));
            pulse.Visible = false;
            errorLabel.Text = message + Environment.NewLine +
                "可打开日志目录查看 server.out.log 与 server.err.log。";
            errorLabel.Visible = true;
            logButton.Visible = true;
            closeButton.Visible = true;
            Invalidate();
        }

        private void BeginFadeOut()
        {
            if (finishRequested)
            {
                return;
            }

            finishRequested = true;
            fadeDirection = -1f;
            animationTimer.Start();
        }

        private void OnAnimationTick(object sender, EventArgs e)
        {
            if (fadeDirection >= 0f)
            {
                animationTimer.Stop();
                return;
            }

            Opacity += fadeDirection * 0.14d;
            if (Opacity <= 0d)
            {
                Opacity = 0d;
                animationTimer.Stop();
                Close();
            }
        }

        private void OnSplashKeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape && (previewMode || errorLabel.Visible))
            {
                Close();
            }
        }

        private void SetStatus(string text)
        {
            if (IsDisposed || !IsHandleCreated)
            {
                return;
            }

            if (InvokeRequired)
            {
                try
                {
                    BeginInvoke(new Action<string>(SetStatus), text);
                }
                catch
                {
                }
                return;
            }

            statusLabel.Text = text;
        }

        private void UpdateRoundedRegion()
        {
            if (Width <= 0 || Height <= 0)
            {
                return;
            }

            float scale = Width / 400f;
            using (GraphicsPath path = CreateRoundedRect(
                new RectangleF(0, 0, Width, Height),
                18f * scale))
            {
                Region oldRegion = Region;
                Region = new Region(path);
                if (oldRegion != null)
                {
                    oldRegion.Dispose();
                }
            }
        }

        private void PaintPulse(object sender, PaintEventArgs e)
        {
            Graphics graphics = e.Graphics;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;

            Rectangle bounds = pulse.ClientRectangle;
            float centerY = bounds.Height / 2f;
            float trackHeight = 3f;

            using (GraphicsPath trackPath = CreateRoundedRect(
                new RectangleF(0, centerY - trackHeight / 2f, bounds.Width, trackHeight),
                trackHeight / 2f))
            using (SolidBrush trackBrush = new SolidBrush(Color.FromArgb(34, 127, 157, 210)))
            {
                graphics.FillPath(trackBrush, trackPath);
            }

            float segmentWidth = Math.Max(54f, bounds.Width * 0.3f);
            float phase = (float)((DateTime.UtcNow.Ticks / 10000L) % 1500L) / 1500f;
            float segmentX = -segmentWidth + (bounds.Width + segmentWidth) * phase;
            RectangleF segmentRect = new RectangleF(
                segmentX,
                centerY - trackHeight / 2f,
                segmentWidth,
                trackHeight);
            GraphicsPath segmentPath = CreateRoundedRect(segmentRect, trackHeight / 2f);

            using (LinearGradientBrush segmentBrush = new LinearGradientBrush(
                new PointF(segmentX, 0),
                new PointF(segmentX + segmentWidth, 0),
                Color.FromArgb(0, 103, 232, 249),
                Color.FromArgb(0, 129, 140, 248)))
            {
                ColorBlend blend = new ColorBlend(3);
                blend.Colors = new Color[]
                {
                    Color.FromArgb(0, 103, 232, 249),
                    Color.FromArgb(235, 116, 231, 255),
                    Color.FromArgb(0, 129, 140, 248)
                };
                blend.Positions = new float[] { 0f, 0.55f, 1f };
                segmentBrush.InterpolationColors = blend;
                graphics.FillPath(segmentBrush, segmentPath);
            }

            segmentPath.Dispose();
        }

        private static Button CreateActionButton(string text, Rectangle bounds)
        {
            Button button = new Button();
            button.BackColor = Color.FromArgb(24, 33, 58);
            button.Cursor = Cursors.Hand;
            button.FlatAppearance.BorderColor = Color.FromArgb(52, 71, 110);
            button.FlatAppearance.BorderSize = 1;
            button.FlatAppearance.MouseDownBackColor = Color.FromArgb(32, 47, 82);
            button.FlatAppearance.MouseOverBackColor = Color.FromArgb(31, 44, 76);
            button.FlatStyle = FlatStyle.Flat;
            button.Font = new Font("Microsoft YaHei UI", 8.5f, FontStyle.Regular);
            button.ForeColor = Color.FromArgb(215, 229, 252);
            button.Bounds = bounds;
            button.Text = text;
            button.Visible = false;
            return button;
        }

        private static Bitmap LoadAppIcon(out Icon icon)
        {
            icon = null;
            try
            {
                string iconPath = Path.Combine(
                    LauncherEngine.ProjectDirectory,
                    "assets",
                    "deepseek-launcher.ico");
                if (File.Exists(iconPath))
                {
                    icon = new Icon(iconPath, 128, 128);
                }
                else
                {
                    icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }

                return icon == null ? null : icon.ToBitmap();
            }
            catch
            {
                return null;
            }
        }

        private static GraphicsPath CreateRoundedRect(RectangleF rect, float radius)
        {
            GraphicsPath path = new GraphicsPath();
            float diameter = Math.Min(radius * 2f, Math.Min(rect.Width, rect.Height));
            if (diameter <= 0f)
            {
                path.AddRectangle(rect);
                return path;
            }

            path.AddArc(rect.X, rect.Y, diameter, diameter, 180f, 90f);
            path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270f, 90f);
            path.AddArc(
                rect.Right - diameter,
                rect.Bottom - diameter,
                diameter,
                diameter,
                0f,
                90f);
            path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90f, 90f);
            path.CloseFigure();
            return path;
        }

        private static float GetDpiScale()
        {
            try
            {
                using (Graphics graphics = Graphics.FromHwnd(IntPtr.Zero))
                {
                    return Math.Max(1f, graphics.DpiX / 96f);
                }
            }
            catch
            {
                return 1f;
            }
        }

        private static Rectangle ScaleBounds(
            int x,
            int y,
            int width,
            int height,
            float scale)
        {
            return new Rectangle(
                (int)Math.Round(x * scale),
                (int)Math.Round(y * scale),
                (int)Math.Round(width * scale),
                (int)Math.Round(height * scale));
        }

        private static Size ScaleSize(int width, int height, float scale)
        {
            return new Size(
                (int)Math.Round(width * scale),
                (int)Math.Round(height * scale));
        }
    }
}
