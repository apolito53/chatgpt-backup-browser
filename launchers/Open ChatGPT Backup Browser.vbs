Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)
command = "wscript.exe """ & rootDir & "\START_BROWSER.vbs"""

shell.Run command, 0, False
