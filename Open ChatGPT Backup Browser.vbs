Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\scripts\start.ps1"""

shell.Run command, 0, False
