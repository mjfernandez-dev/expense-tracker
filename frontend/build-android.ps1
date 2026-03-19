$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot"
$env:ANDROID_HOME = "C:\Users\Matías\AppData\Local\Android\Sdk"
Set-Location "D:\01_Desarrollo\DesarrolloPersonal\Python\gastos\frontend\android"
& ".\gradlew.bat" assembleDebug
