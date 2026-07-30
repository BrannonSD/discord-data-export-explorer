using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace DiscordDataExportExplorer
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    public class LauncherForm : Form
    {
        private TextBox txtFolder;
        private Button btnBrowse;
        private Button btnStart;
        private Button btnStop;
        private Label lblStatus;
        private Process serverProcess = null;

        public LauncherForm()
        {
            this.Text = "Discord Data Export Explorer Launcher";
            this.Width = 580;
            this.Height = 320;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;

            Label lblTitle = new Label()
            {
                Text = "Discord Data Export Explorer",
                Left = 20, Top = 20, Width = 520, Height = 30,
                Font = new System.Drawing.Font("Segoe UI", 14, System.Drawing.FontStyle.Bold)
            };

            Label lblSub = new Label()
            {
                Text = "Select your unzipped Discord Data Package folder (containing Account, Messages, Servers):",
                Left = 20, Top = 55, Width = 520, Height = 20,
                Font = new System.Drawing.Font("Segoe UI", 9, System.Drawing.FontStyle.Regular)
            };

            txtFolder = new TextBox()
            {
                Left = 20, Top = 80, Width = 400, Height = 26,
                Font = new System.Drawing.Font("Segoe UI", 9.5f)
            };

            btnBrowse = new Button()
            {
                Text = "📁 Browse...",
                Left = 430, Top = 78, Width = 110, Height = 30,
                Font = new System.Drawing.Font("Segoe UI", 9, System.Drawing.FontStyle.Regular)
            };
            btnBrowse.Click += BtnBrowse_Click;

            btnStart = new Button()
            {
                Text = "🚀 Start Server & Open Browser",
                Left = 20, Top = 130, Width = 260, Height = 40,
                BackColor = System.Drawing.Color.FromArgb(88, 101, 242),
                ForeColor = System.Drawing.Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new System.Drawing.Font("Segoe UI", 10, System.Drawing.FontStyle.Bold)
            };
            btnStart.Click += BtnStart_Click;

            btnStop = new Button()
            {
                Text = "🛑 Stop Server",
                Left = 290, Top = 130, Width = 250, Height = 40,
                BackColor = System.Drawing.Color.FromArgb(200, 50, 50),
                ForeColor = System.Drawing.Color.White,
                FlatStyle = FlatStyle.Flat,
                Enabled = false,
                Font = new System.Drawing.Font("Segoe UI", 10, System.Drawing.FontStyle.Bold)
            };
            btnStop.Click += BtnStop_Click;

            lblStatus = new Label()
            {
                Text = "Status: Ready. Select a folder and click Start Server.",
                Left = 20, Top = 195, Width = 520, Height = 40,
                Font = new System.Drawing.Font("Segoe UI", 9.5f, System.Drawing.FontStyle.Italic),
                ForeColor = System.Drawing.Color.DarkGray
            };

            this.Controls.Add(lblTitle);
            this.Controls.Add(lblSub);
            this.Controls.Add(txtFolder);
            this.Controls.Add(btnBrowse);
            this.Controls.Add(btnStart);
            this.Controls.Add(btnStop);
            this.Controls.Add(lblStatus);

            this.FormClosing += LauncherForm_FormClosing;
        }

        private void BtnBrowse_Click(object sender, EventArgs e)
        {
            string selectedFolder = ModernFolderPicker.ShowDialog(this.Handle);
            if (!string.IsNullOrEmpty(selectedFolder))
            {
                txtFolder.Text = selectedFolder;
            }
        }

        private void BtnStart_Click(object sender, EventArgs e)
        {
            string folder = txtFolder.Text.Trim();
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverScript = Path.Combine(appDir, "server.js");

            if (!File.Exists(serverScript))
            {
                MessageBox.Show("server.js was not found in the application directory!", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("node.exe")
                {
                    Arguments = string.Format("\"{0}\" --package \"{1}\"", serverScript, folder),
                    WorkingDirectory = appDir,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                serverProcess = Process.Start(psi);

                btnStart.Enabled = false;
                btnStop.Enabled = true;
                lblStatus.Text = "Status: Server running on http://localhost:3000";
                lblStatus.ForeColor = System.Drawing.Color.Green;

                System.Threading.Thread.Sleep(1000);
                Process.Start("http://localhost:3000");
            }
            catch (Exception ex)
            {
                MessageBox.Show(string.Format("Failed to start Node server: {0}\nMake sure Node.js is installed on your system.", ex.Message), "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void BtnStop_Click(object sender, EventArgs e)
        {
            StopServer();
        }

        private void StopServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    serverProcess.Kill();
                }
                catch { }
                serverProcess = null;
            }
            btnStart.Enabled = true;
            btnStop.Enabled = false;
            lblStatus.Text = "Status: Server stopped.";
            lblStatus.ForeColor = System.Drawing.Color.DarkGray;
        }

        private void LauncherForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            StopServer();
        }
    }

    // Modern Windows File Explorer Folder Dialog Implementation using COM IFileOpenDialog
    public static class ModernFolderPicker
    {
        [ComImport]
        [Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
        [ClassInterface(ClassInterfaceType.None)]
        private class FileOpenDialog { }

        [ComImport]
        [Guid("d57c7288-d4ad-4768-be02-9d969532d960")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IFileOpenDialog
        {
            // IModalWindow
            [PreserveSig] int Show([In] IntPtr parent);

            // IFileDialog
            void SetFileTypes([In] uint cFileTypes, [In] IntPtr rgFilterSpec);
            void SetFileTypeIndex([In] uint iFileType);
            void GetFileTypeIndex(out uint piFileType);
            void Advise([In] IntPtr pfde, out uint pdwCookie);
            void Unadvise([In] uint dwCookie);
            void SetOptions([In] uint dwFlags);
            void GetOptions(out uint pdwFlags);
            void SetDefaultFolder([In] IShellItem psi);
            void SetFolder([In] IShellItem psi);
            void GetFolder(out IShellItem ppsi);
            void GetCurrentSelection(out IShellItem ppsi);
            void SetFileName([In, MarshalAs(UnmanagedType.LPWStr)] string pszName);
            void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
            void SetTitle([In, MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
            void SetOkButtonLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszText);
            void SetFileNameLabel([In, MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
            void GetResult(out IShellItem ppsi);
            void AddPlace([In] IShellItem psi, uint fdap);
            void SetDefaultExtension([In, MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
            void Close([MarshalAs(UnmanagedType.Error)] int hr);
            void SetClientGuid([In] ref Guid guid);
            void ClearClientData();
            void SetFilter([In] IntPtr pFilter);

            // IFileOpenDialog
            void GetResults(out IntPtr ppenum);
            void GetSelectedItems(out IntPtr ppsai);
        }

        [ComImport]
        [Guid("4382691E-E70A-4224-BE0C-CE2BBDDE0D3C")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IShellItem
        {
            void BindToHandler([In] IntPtr pbc, [In] ref Guid bhid, [In] ref Guid riid, out IntPtr ppv);
            void GetParent(out IShellItem ppsi);
            void GetDisplayName([In] uint sigdnName, out IntPtr ppszName);
            void GetAttributes([In] uint sfgaoMask, out uint psfgaoAttribs);
            void Compare([In] IShellItem psi, [In] uint hint, out int piOrder);
        }

        private const uint FOS_PICKFOLDERS = 0x00000020;
        private const uint FOS_FORCEFILESYSTEM = 0x00000040;
        private const uint SIGDN_FILESYSPATH = 0x80058000;

        public static string ShowDialog(IntPtr owner)
        {
            try
            {
                IFileOpenDialog dialog = (IFileOpenDialog)new FileOpenDialog();
                dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
                dialog.SetTitle("Select your Discord Data Package folder");

                int hr = dialog.Show(owner);
                if (hr == 0) // S_OK
                {
                    IShellItem result;
                    dialog.GetResult(out result);
                    IntPtr pathPtr;
                    result.GetDisplayName(SIGDN_FILESYSPATH, out pathPtr);
                    string path = Marshal.PtrToStringUni(pathPtr);
                    Marshal.FreeCoTaskMem(pathPtr);
                    return path;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Folder Selection Error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return null;
        }
    }
}
