using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace DeepSeekUsageTray
{
    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main(string[] args)
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, @"Local\DeepSeekUsageTray", out createdNew))
            {
                if (!createdNew)
                {
                    SignalExistingInstance();
                    return;
                }

                bool showOnStart = args == null || args.Length == 0;
                if (args != null)
                {
                    foreach (string arg in args)
                    {
                        if (string.Equals(arg, "--show", StringComparison.OrdinalIgnoreCase))
                        {
                            showOnStart = true;
                        }
                    }
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
                using (TrayContext context = new TrayContext(showOnStart))
                {
                    Application.Run(context);
                }
                GC.KeepAlive(mutex);
            }
        }

        private static void SignalExistingInstance()
        {
            for (int attempt = 0; attempt < 8; attempt++)
            {
                try
                {
                    using (EventWaitHandle showEvent = EventWaitHandle.OpenExisting(@"Local\DeepSeekUsageWidgetShow"))
                    {
                        showEvent.Set();
                        return;
                    }
                }
                catch
                {
                    Thread.Sleep(120);
                }
            }
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private const string WidgetTitle = "DeepSeek Usage Widget";
        private const string ShowEventName = @"Local\DeepSeekUsageWidgetShow";
        private const int SwHide = 0;
        private const int SwRestore = 9;
        private const int SwShowNoActivate = 4;
        private const uint WmClose = 0x0010;
        private const uint SwpNoSize = 0x0001;
        private const uint SwpNoMove = 0x0002;
        private const uint SwpNoActivate = 0x0010;
        private const uint SwpShowWindow = 0x0040;
        private static readonly IntPtr HwndTopmost = new IntPtr(-1);
        private static readonly IntPtr HwndNotTopmost = new IntPtr(-2);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(
            IntPtr hWnd,
            IntPtr hWndInsertAfter,
            int x,
            int y,
            int cx,
            int cy,
            uint flags);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool DestroyIcon(IntPtr hIcon);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        private readonly string projectDirectory;
        private readonly string dashboardUrl = "http://127.0.0.1:4173";
        private readonly NotifyIcon notifyIcon;
        private readonly ContextMenuStrip menu;
        private readonly ToolStripMenuItem autoShowItem;
        private readonly ToolStripMenuItem topMostItem;
        private readonly System.Windows.Forms.Timer timer;
        private readonly EventWaitHandle showEvent;
        private readonly Icon trayIcon;
        private readonly IntPtr trayIconHandle;
        private Process serverProcess;
        private IntPtr widgetWindow = IntPtr.Zero;
        private bool userHidden;
        private bool topMost = true;
        private bool screenCaptureActive;
        private bool disposed;

        public TrayContext(bool showOnStart)
        {
            projectDirectory = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            EnsureServer();

            trayIconHandle = CreateTrayIconHandle();
            trayIcon = Icon.FromHandle(trayIconHandle);
            menu = new ContextMenuStrip();

            ToolStripMenuItem showItem = new ToolStripMenuItem("显示监控面板");
            showItem.Click += delegate { ShowWidget(true); };
            menu.Items.Add(showItem);

            ToolStripMenuItem hideItem = new ToolStripMenuItem("隐藏到托盘");
            hideItem.Click += delegate { HideWidget(true); };
            menu.Items.Add(hideItem);
            menu.Items.Add(new ToolStripSeparator());

            autoShowItem = new ToolStripMenuItem("随 Codex 显示 / 隐藏");
            autoShowItem.CheckOnClick = true;
            autoShowItem.Checked = false;
            menu.Items.Add(autoShowItem);

            topMostItem = new ToolStripMenuItem("窗口置顶");
            topMostItem.CheckOnClick = true;
            topMostItem.Checked = true;
            topMostItem.Click += delegate
            {
                topMost = topMostItem.Checked;
                ApplyTopMostState();
            };
            menu.Items.Add(topMostItem);
            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("退出");
            exitItem.Click += delegate { ExitApplication(); };
            menu.Items.Add(exitItem);

            notifyIcon = new NotifyIcon();
            notifyIcon.Icon = trayIcon;
            notifyIcon.Text = "DeepSeek 用量监控";
            notifyIcon.Visible = true;
            notifyIcon.ContextMenuStrip = menu;
            notifyIcon.DoubleClick += delegate
            {
                IntPtr hWnd = FindWidgetWindow();
                if (hWnd != IntPtr.Zero && IsWindowVisible(hWnd))
                {
                    HideWidget(true);
                }
                else
                {
                    ShowWidget(true);
                }
            };

            showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
            timer = new System.Windows.Forms.Timer();
            timer.Interval = 150;
            timer.Tick += delegate { Tick(); };
            timer.Start();

            if (showOnStart)
            {
                ShowWidget(false);
            }
            else
            {
                userHidden = true;
            }
        }

        private bool IsServerRunning()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(dashboardUrl + "/api/health");
                request.Timeout = 700;
                request.ReadWriteTimeout = 700;
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

        private void EnsureServer()
        {
            if (IsServerRunning())
            {
                return;
            }

            try
            {
                ProcessStartInfo info = new ProcessStartInfo("node.exe", "server.js");
                info.WorkingDirectory = projectDirectory;
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.WindowStyle = ProcessWindowStyle.Hidden;
                serverProcess = Process.Start(info);
            }
            catch
            {
                return;
            }

            for (int attempt = 0; attempt < 30; attempt++)
            {
                Thread.Sleep(200);
                if (IsServerRunning())
                {
                    break;
                }
            }
        }

        private string FindBrowserPath()
        {
            string[] candidates = new string[]
            {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\Microsoft\Edge\Application\msedge.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) + @"\Microsoft\Edge\Application\msedge.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) + @"\Google\Chrome\Application\chrome.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) + @"\Google\Chrome\Application\chrome.exe",
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + @"\Google\Chrome\Application\chrome.exe"
            };

            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            return null;
        }

        private void LaunchWidget()
        {
            string hostPath = Path.Combine(
                projectDirectory,
                "desktop",
                "DeepSeekWidgetHost.exe");
            if (File.Exists(hostPath))
            {
                try
                {
                    ProcessStartInfo hostInfo = new ProcessStartInfo(hostPath);
                    hostInfo.WorkingDirectory = projectDirectory;
                    hostInfo.UseShellExecute = false;
                    hostInfo.EnvironmentVariables["DEEPSEEK_WIDGET_URL"] =
                        dashboardUrl + "/?widget=1&follow=1&hosted=1";
                    Process.Start(hostInfo);
                    return;
                }
                catch
                {
                    // Fall back to the Edge app window below.
                }
            }

            string browser = FindBrowserPath();
            if (browser == null)
            {
                try
                {
                    Process.Start(dashboardUrl + "/?widget=1&follow=1");
                }
                catch
                {
                }
                return;
            }

            string profileDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "DeepSeekUsageMonitor",
                "widget-profile-v2");
            Directory.CreateDirectory(profileDirectory);

            try
            {
                ProcessStartInfo info = new ProcessStartInfo(browser);
                info.UseShellExecute = false;
                info.Arguments =
                    "--app=" + dashboardUrl + "/?widget=1&follow=1" +
                    " --user-data-dir=\"" + profileDirectory + "\"" +
                    " --force-device-scale-factor=1" +
                    " --window-size=740,650 --window-position=120,100" +
                    " --no-first-run --no-default-browser-check --disable-sync";
                Process.Start(info);
            }
            catch
            {
            }
        }

        private static string WindowTitle(IntPtr hWnd)
        {
            int length = GetWindowTextLength(hWnd);
            if (length <= 0)
            {
                return "";
            }
            StringBuilder builder = new StringBuilder(length + 1);
            GetWindowText(hWnd, builder, builder.Capacity);
            return builder.ToString();
        }

        private IntPtr FindWidgetWindow()
        {
            IntPtr found = IntPtr.Zero;
            EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)
            {
                string title = WindowTitle(hWnd);
                if (title.IndexOf(WidgetTitle, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    found = hWnd;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
            widgetWindow = found;
            return found;
        }

        private void ApplyTopMostState()
        {
            IntPtr hWnd = FindWidgetWindow();
            if (hWnd == IntPtr.Zero)
            {
                return;
            }
            uint flags = SwpNoMove | SwpNoSize | SwpNoActivate | SwpShowWindow;
            SetWindowPos(hWnd, topMost ? HwndTopmost : HwndNotTopmost, 0, 0, 0, 0, flags);
        }

        private void ShowWidget(bool activate)
        {
            userHidden = false;
            IntPtr hWnd = FindWidgetWindow();
            if (hWnd == IntPtr.Zero)
            {
                LaunchWidget();
                return;
            }

            ShowWindowAsync(hWnd, activate ? SwRestore : SwShowNoActivate);
            if (topMost)
            {
                ApplyTopMostState();
            }
            if (activate)
            {
                SetForegroundWindow(hWnd);
            }
        }

        private void HideWidget(bool manual)
        {
            if (manual)
            {
                userHidden = true;
            }
            IntPtr hWnd = FindWidgetWindow();
            if (hWnd != IntPtr.Zero)
            {
                ShowWindowAsync(hWnd, SwHide);
            }
        }

        private bool IsWidgetForeground()
        {
            IntPtr foreground = GetForegroundWindow();
            if (foreground == IntPtr.Zero)
            {
                return false;
            }
            return WindowTitle(foreground).IndexOf(WidgetTitle, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private bool IsCodexActive()
        {
            IntPtr foreground = GetForegroundWindow();
            if (foreground == IntPtr.Zero)
            {
                return false;
            }

            string title = WindowTitle(foreground);
            if (title.IndexOf("Codex", StringComparison.OrdinalIgnoreCase) >= 0 ||
                title.IndexOf("ChatGPT", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            uint processId;
            GetWindowThreadProcessId(foreground, out processId);
            try
            {
                string name = Process.GetProcessById((int)processId).ProcessName;
                return string.Equals(name, "ChatGPT", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(name, "Codex", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private bool IsScreenCaptureActive()
        {
            IntPtr foreground = GetForegroundWindow();
            if (foreground == IntPtr.Zero)
            {
                return false;
            }

            uint processId;
            GetWindowThreadProcessId(foreground, out processId);
            try
            {
                string name = Process.GetProcessById((int)processId).ProcessName;
                return string.Equals(name, "SnippingTool", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(name, "ScreenSketch", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(name, "Snipaste", StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private void Tick()
        {
            bool captureActive = IsScreenCaptureActive();
            if (captureActive != screenCaptureActive)
            {
                screenCaptureActive = captureActive;
                IntPtr captureWindow = FindWidgetWindow();
                if (captureWindow != IntPtr.Zero)
                {
                    if (screenCaptureActive)
                    {
                        SetWindowPos(
                            captureWindow,
                            HwndNotTopmost,
                            0,
                            0,
                            0,
                            0,
                            SwpNoMove | SwpNoSize | SwpNoActivate);
                    }
                    else if (topMost)
                    {
                        ApplyTopMostState();
                    }
                }
            }

            if (topMost && !screenCaptureActive)
            {
                IntPtr topWindow = FindWidgetWindow();
                if (topWindow != IntPtr.Zero && IsWindowVisible(topWindow))
                {
                    ApplyTopMostState();
                }
            }

            if (showEvent.WaitOne(0))
            {
                ShowWidget(false);
                return;
            }

            if (!autoShowItem.Checked || userHidden)
            {
                return;
            }

            IntPtr hWnd = FindWidgetWindow();
            if (hWnd == IntPtr.Zero)
            {
                return;
            }

            bool visible = IsWindowVisible(hWnd);
            if (IsCodexActive() && !visible)
            {
                ShowWidget(false);
            }
            else if (!IsCodexActive() && !IsWidgetForeground() && visible)
            {
                HideWidget(false);
            }
        }

        private static IntPtr CreateTrayIconHandle()
        {
            Bitmap bitmap = new Bitmap(32, 32);
            using (Graphics graphics = Graphics.FromImage(bitmap))
            using (SolidBrush background = new SolidBrush(Color.FromArgb(76, 105, 255)))
            using (SolidBrush foreground = new SolidBrush(Color.White))
            using (Font font = new Font("Segoe UI", 15, FontStyle.Bold, GraphicsUnit.Pixel))
            {
                graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                graphics.Clear(Color.Transparent);
                graphics.FillEllipse(background, 1, 1, 30, 30);
                graphics.DrawString("D", font, foreground, new PointF(9, 6));
            }
            return bitmap.GetHicon();
        }

        private void ExitApplication()
        {
            if (disposed)
            {
                return;
            }
            disposed = true;

            timer.Stop();
            notifyIcon.Visible = false;
            notifyIcon.Dispose();
            menu.Dispose();
            showEvent.Dispose();

            IntPtr hWnd = FindWidgetWindow();
            if (hWnd != IntPtr.Zero)
            {
                SendMessage(hWnd, WmClose, IntPtr.Zero, IntPtr.Zero);
            }

            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    serverProcess.Kill();
                }
                catch
                {
                }
            }

            if (trayIconHandle != IntPtr.Zero)
            {
                trayIcon.Dispose();
                DestroyIcon(trayIconHandle);
            }

            ExitThread();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && !disposed)
            {
                ExitApplication();
            }
            base.Dispose(disposing);
        }
    }
}
