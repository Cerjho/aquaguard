# Mosquitto MQTT Broker - Windows Setup

## Install

```powershell

winget install EclipseFoundation.Mosquitto

```

If winget fails, download directly from:
[https://mosquitto.org/download/](https://mosquitto.org/download/)
Choose: mosquitto-2.x.x-install-win64.exe

## Add to PATH

After install, add to System PATH:
C:\\Program Files\\mosquitto\\

## Verify

```powershell

mosquitto --version

```

## Run

```powershell

mosquitto -c mqtt/mosquitto.conf

```

Run this in a separate terminal before starting the backend or detection engine.
