using System;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class HardwareAgentUninstaller
{
    private const string ProductName = "SSAXXON POS Hardware Agent";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\SSAXXONPOSHardwareAgent";
    private const string MarkerName = ".ssaxxon-pos-hardware-agent";
    private const string MarkerValue = "SSAXXON POS Hardware Agent";

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool silent = args.Length > 0 && String.Equals(args[0], "/S", StringComparison.OrdinalIgnoreCase);

        try
        {
            string installDirectory = Path.GetDirectoryName(
                System.Reflection.Assembly.GetExecutingAssembly().Location);
            string markerPath = Path.Combine(installDirectory, MarkerName);
            if (!File.Exists(markerPath) || File.ReadAllText(markerPath) != MarkerValue)
                throw new InvalidOperationException("No se pudo verificar la carpeta de instalacion. No se elimino ningun archivo.");

            bool keepConfiguration = false;
            if (!silent)
            {
                DialogResult choice = MessageBox.Show(
                    "Se quitara " + ProductName + ".\r\n\r\n" +
                    "¿Deseas conservar el archivo .env con la configuracion del agente?",
                    "Desinstalar " + ProductName,
                    MessageBoxButtons.YesNoCancel,
                    MessageBoxIcon.Question);
                if (choice == DialogResult.Cancel) return 0;
                keepConfiguration = choice == DialogResult.Yes;
            }

            RemoveShortcut(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs),
                ProductName,
                ProductName + ".lnk"));
            RemoveShortcut(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                ProductName + ".lnk"));

            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);

            if (Directory.Exists(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs), ProductName)))
            {
                Directory.Delete(Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs), ProductName), true);
            }

            ScheduleCleanup(installDirectory, keepConfiguration);
            if (!silent)
            {
                MessageBox.Show(
                    "La desinstalacion ha comenzado. Cierra el agente si esta en ejecucion para permitir eliminar todos sus archivos.",
                    ProductName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "No se pudo desinstalar el agente.\r\n\r\n" + error.Message,
                ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static void RemoveShortcut(string shortcutPath)
    {
        if (File.Exists(shortcutPath)) File.Delete(shortcutPath);
    }

    private static void ScheduleCleanup(string installDirectory, bool keepConfiguration)
    {
        string escapedDirectory = installDirectory.Replace("'", "''");
        string cleanup = "$p='" + escapedDirectory + "'; " +
            "for($i=0;$i -lt 60 -and (Test-Path -LiteralPath $p);$i++){ " +
            "Start-Sleep -Milliseconds 500; " +
            "try { " +
            "if(" + (keepConfiguration ? "$true" : "$false") + "){ " +
            "Get-ChildItem -LiteralPath $p -Force | Where-Object { $_.Name -ne '.env' } | Remove-Item -Recurse -Force -ErrorAction Stop; " +
            "if(-not (Test-Path -LiteralPath (Join-Path $p '.env'))){ Remove-Item -LiteralPath $p -Force -ErrorAction Stop } " +
            "} else { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop }; " +
            "break " +
            "} catch {} }";
        string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(cleanup));
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe"),
            Arguments = "-NoProfile -WindowStyle Hidden -EncodedCommand " + encoded,
            UseShellExecute = false,
            CreateNoWindow = true
        });
    }
}
