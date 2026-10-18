using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class HardwareAgentSetup
{
    private const string ProductName = "SSAXXON POS Hardware Agent";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\SSAXXONPOSHardwareAgent";
    private const string MarkerName = ".ssaxxon-pos-hardware-agent";
    private const string MarkerValue = "SSAXXON POS Hardware Agent";
    private static readonly string StartMenuDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.Programs), ProductName);
    private static readonly string DesktopShortcut = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), ProductName + ".lnk");

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            if (args.Length > 0 && String.Equals(args[0], "/S", StringComparison.OrdinalIgnoreCase))
            {
                string installDirectory = ParseInstallDirectory(args);
                Install(installDirectory, false, false);
                return 0;
            }

            using (SetupForm form = new SetupForm(DefaultInstallDirectory()))
            {
                if (form.ShowDialog() != DialogResult.OK) return 0;
                Install(form.InstallDirectory, form.CreateDesktopShortcut, form.LaunchAgent);
            }

            MessageBox.Show(
                "SSAXXON POS Hardware Agent se instalo correctamente.",
                ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "No se pudo instalar el agente.\r\n\r\n" + error.Message,
                ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string ParseInstallDirectory(string[] args)
    {
        string prefix = "/D=";
        string value = args.FirstOrDefault(argument =>
            argument.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
        return value == null ? DefaultInstallDirectory() : value.Substring(prefix.Length).Trim('"');
    }

    private static string DefaultInstallDirectory()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            ProductName);
    }

    private static void Install(string installDirectory, bool createDesktopShortcut, bool launchAgent)
    {
        if (String.IsNullOrWhiteSpace(installDirectory))
            throw new InvalidOperationException("Selecciona una carpeta de instalacion.");

        string fullDirectory = Path.GetFullPath(installDirectory);
        Directory.CreateDirectory(fullDirectory);

        Assembly assembly = Assembly.GetExecutingAssembly();
        using (Stream payload = assembly.GetManifestResourceStream("WindowsPayload.zip"))
        {
            if (payload == null)
                throw new InvalidOperationException("El instalador no contiene los archivos del agente.");

            using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string destination = Path.GetFullPath(Path.Combine(fullDirectory, entry.FullName));
                    if (!destination.StartsWith(
                        fullDirectory.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,
                        StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("El paquete contiene una ruta de archivo no valida.");

                    if (String.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(destination);
                        continue;
                    }

                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    using (Stream source = entry.Open())
                    using (FileStream target = new FileStream(destination, FileMode.Create, FileAccess.Write))
                    {
                        source.CopyTo(target);
                    }
                }
            }
        }

        File.WriteAllText(Path.Combine(fullDirectory, MarkerName), MarkerValue);
        EnsureDefaultConfiguration(fullDirectory);

        string executable = Path.Combine(fullDirectory, "HardwareAgent.exe");
        if (!File.Exists(executable))
            throw new FileNotFoundException("El paquete no contiene HardwareAgent.exe.", executable);

        Directory.CreateDirectory(StartMenuDirectory);
        CreateShortcut(Path.Combine(StartMenuDirectory, ProductName + ".lnk"), executable, fullDirectory);

        if (createDesktopShortcut)
            CreateShortcut(DesktopShortcut, executable, fullDirectory);
        else if (File.Exists(DesktopShortcut))
            File.Delete(DesktopShortcut);

        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            if (key == null) throw new InvalidOperationException("No se pudo registrar el desinstalador de Windows.");
            key.SetValue("DisplayName", ProductName);
            key.SetValue("DisplayVersion", "1.0.0");
            key.SetValue("Publisher", "SSAXXON POS");
            key.SetValue("InstallLocation", fullDirectory);
            key.SetValue("UninstallString", "\"" + Path.Combine(fullDirectory, "Uninstall.exe") + "\"");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }

        if (launchAgent)
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = executable,
                WorkingDirectory = fullDirectory,
                UseShellExecute = true
            });
        }
    }

    private static void EnsureDefaultConfiguration(string installDirectory)
    {
        string defaultsPath = Path.Combine(installDirectory, ".env.example");
        string environmentPath = Path.Combine(installDirectory, ".env");
        if (!File.Exists(environmentPath))
        {
            File.Copy(defaultsPath, environmentPath);
            return;
        }

        string[] defaultLines = File.ReadAllLines(defaultsPath);
        string defaultToken = FindSetting(defaultLines, "HARDWARE_AGENT_TOKEN");
        string defaultTransport = FindSetting(defaultLines, "HARDWARE_PRINTER_TRANSPORT");
        if (String.IsNullOrWhiteSpace(defaultToken))
            throw new InvalidOperationException("El instalador no contiene el token configurado para el frontend.");

        string[] existingLines = File.ReadAllLines(environmentPath);
        bool tokenUpdated = false;
        bool transportUpdated = false;
        for (int index = 0; index < existingLines.Length; index++)
        {
            if (IsSetting(existingLines[index], "HARDWARE_AGENT_TOKEN"))
            {
                existingLines[index] = "HARDWARE_AGENT_TOKEN=" + defaultToken;
                tokenUpdated = true;
            }
            else if (IsSetting(existingLines[index], "HARDWARE_PRINTER_TRANSPORT") &&
                (String.IsNullOrWhiteSpace(FindSetting(new[] { existingLines[index] }, "HARDWARE_PRINTER_TRANSPORT")) ||
                 String.Equals(FindSetting(new[] { existingLines[index] }, "HARDWARE_PRINTER_TRANSPORT"), "mock", StringComparison.OrdinalIgnoreCase)))
            {
                existingLines[index] = "HARDWARE_PRINTER_TRANSPORT=" + defaultTransport;
                transportUpdated = true;
            }
        }

        if (!tokenUpdated)
        {
            existingLines = existingLines.Concat(new[] { "HARDWARE_AGENT_TOKEN=" + defaultToken }).ToArray();
        }
        if (!transportUpdated && !existingLines.Any(line => IsSetting(line, "HARDWARE_PRINTER_TRANSPORT")))
        {
            existingLines = existingLines.Concat(new[] { "HARDWARE_PRINTER_TRANSPORT=" + defaultTransport }).ToArray();
        }
        File.WriteAllLines(environmentPath, existingLines, new UTF8Encoding(false));
    }

    private static bool IsSetting(string line, string name)
    {
        return Regex.IsMatch(line, "^\\s*" + Regex.Escape(name) + "\\s*=", RegexOptions.CultureInvariant);
    }

    private static string FindSetting(string[] lines, string name)
    {
        string line = lines.FirstOrDefault(value => IsSetting(value, name));
        if (line == null) return null;
        return Regex.Replace(line, "^\\s*" + Regex.Escape(name) + "\\s*=\\s*", "", RegexOptions.CultureInvariant).Trim().Trim('"', '\'');
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) throw new InvalidOperationException("Windows Script Host no esta disponible.");

        object shell = Activator.CreateInstance(shellType);
        object shortcut = null;
        try
        {
            shortcut = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null,
                shell,
                new object[] { shortcutPath });
            Type shortcutType = shortcut.GetType();
            shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
            shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
            shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ",0" });
            shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        }
        finally
        {
            if (shortcut != null && System.Runtime.InteropServices.Marshal.IsComObject(shortcut))
                System.Runtime.InteropServices.Marshal.ReleaseComObject(shortcut);
            if (System.Runtime.InteropServices.Marshal.IsComObject(shell))
                System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
        }
    }

    private sealed class SetupForm : Form
    {
        private readonly TextBox directoryBox;
        private readonly CheckBox desktopBox;
        private readonly CheckBox launchBox;

        public string InstallDirectory { get { return directoryBox.Text.Trim(); } }
        public bool CreateDesktopShortcut { get { return desktopBox.Checked; } }
        public bool LaunchAgent { get { return launchBox.Checked; } }

        public SetupForm(string defaultDirectory)
        {
            Text = "Instalar " + ProductName;
            Width = 560;
            Height = 270;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;

            Label heading = new Label
            {
                Text = "Instalacion del agente de hardware POS",
                Left = 20,
                Top = 18,
                Width = 500,
                Height = 28,
                Font = new System.Drawing.Font("Segoe UI", 13, System.Drawing.FontStyle.Bold)
            };
            Controls.Add(heading);

            Controls.Add(new Label
            {
                Text = "Carpeta de instalacion:",
                Left = 22,
                Top = 64,
                Width = 160
            });

            directoryBox = new TextBox { Left = 22, Top = 86, Width = 405, Text = defaultDirectory };
            Controls.Add(directoryBox);

            Button browseButton = new Button { Text = "Examinar...", Left = 435, Top = 84, Width = 92 };
            browseButton.Click += delegate
            {
                using (FolderBrowserDialog dialog = new FolderBrowserDialog())
                {
                    dialog.Description = "Selecciona la carpeta donde se instalara el agente";
                    dialog.SelectedPath = Directory.Exists(directoryBox.Text)
                        ? directoryBox.Text
                        : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    if (dialog.ShowDialog(this) == DialogResult.OK) directoryBox.Text = dialog.SelectedPath;
                }
            };
            Controls.Add(browseButton);

            desktopBox = new CheckBox
            {
                Text = "Crear acceso directo en el escritorio",
                Left = 23,
                Top = 124,
                Width = 300,
                Checked = true
            };
            Controls.Add(desktopBox);

            launchBox = new CheckBox
            {
                Text = "Iniciar el agente al terminar",
                Left = 23,
                Top = 151,
                Width = 300,
                Checked = true
            };
            Controls.Add(launchBox);

            Button cancelButton = new Button
            {
                Text = "Cancelar",
                Left = 342,
                Top = 190,
                Width = 88,
                DialogResult = DialogResult.Cancel
            };
            Controls.Add(cancelButton);

            Button installButton = new Button { Text = "Instalar", Left = 439, Top = 190, Width = 88 };
            installButton.Click += delegate
            {
                if (String.IsNullOrWhiteSpace(InstallDirectory))
                {
                    MessageBox.Show(this, "Selecciona una carpeta de instalacion.", ProductName,
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                DialogResult = DialogResult.OK;
                Close();
            };
            Controls.Add(installButton);

            AcceptButton = installButton;
            CancelButton = cancelButton;
        }
    }
}
