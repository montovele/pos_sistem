using System;
using System.Diagnostics;
using System.IO;

internal static class HardwareAgentLauncher
{
    private static int Main()
    {
        string packageDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string launcherPath = Path.Combine(packageDirectory, "launch.cmd");

        if (!File.Exists(launcherPath))
        {
            Console.Error.WriteLine("No se encontro launch.cmd. Mantenga HardwareAgent.exe en la carpeta del paquete.");
            return 1;
        }

        try
        {
            string commandProcessor = Environment.GetEnvironmentVariable("ComSpec");
            if (String.IsNullOrEmpty(commandProcessor))
            {
                commandProcessor = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.System),
                    "cmd.exe");
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = commandProcessor;
            startInfo.Arguments = "/d /c \"\"" + launcherPath + "\"\"";
            startInfo.WorkingDirectory = packageDirectory;
            startInfo.UseShellExecute = false;

            using (Process process = Process.Start(startInfo))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("No se pudo iniciar el agente: " + error.Message);
            return 1;
        }
    }
}
