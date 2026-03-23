# AquaGuard Architecture Diagrams

## Context Diagram

```mermaid
graph TD
    User[Dashboard User] -->|HTTPS + WebSocket| FE[React Frontend]
    FE -->|REST/WebSocket| BE[Flask Backend]
    DE[Detection Engine] -->|Internal API + Snapshot Files| BE
    DE -->|MQTT Alerts| MQ[MQTT Broker]
    MQ --> ESP[ESP32 Alarm Node]
    BE --> DB[(SQL Database)]
```text

## Detection Pipeline Sequence

```mermaid
sequenceDiagram
    participant Cam as Camera
    participant Cap as CameraCapture
    participant Det as DrowningDetector
    participant Pose as PoseEstimator
    participant Ana as BehaviorAnalyzer
    participant Filt as ConfidenceFilter
    participant Alert as AlertEngine
    participant API as Backend /events
    participant MQTT as MQTT Broker

    Cam->>Cap: Frame
    Cap->>Det: frame
    Det->>Pose: bbox ROI
    Pose->>Ana: landmarks
    Ana->>Filt: score(track_id)
    Filt-->>Alert: trigger (N/T/K met)
    Alert->>API: POST event + snapshot
    Alert->>MQTT: publish alert payload
```text

## Runtime Ownership Diagram

```mermaid
flowchart LR
    subgraph Frontend
      A1[AlertProvider]
      A2[Socket state]
      A3[System state polling]
    end

    subgraph Backend
      B1[Routes]
      B2[Service layer]
      B3[Models]
      B4[SocketIO]
    end

    subgraph DetectionEngine
      D1[main.py orchestration]
      D2[Per-zone detector]
      D3[Per-zone analyzers/filters]
      D4[Alert dispatch pool]
    end

    A1 --> B1
    B1 --> B2 --> B3
    B1 --> B4 --> A2
    D1 --> D2 --> D3 --> D4 --> B1
```text
