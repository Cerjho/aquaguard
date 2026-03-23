# AquaGuard — IoT-Based Drowning Detection and Real-Time Alert System

## Complete System Design, Software Architecture, and Technical Implementation Plan

> **Institution:** Mabini Colleges, Inc. — College of Computer Studies  
> **Course:** Software Engineering | Bachelor of Science in Computer Science  
> **Academic Year:** 2025–2026  
> **Document Version:** 1.0  
> **Classification:** Technical Design Document — Development Team Reference  
> **Defense Date:** March 12, 2026  

---

**Development Team**

| Role | Member |
|---|---|
| Project Manager / Requirements Analyst | Jarvy Joy Longenos |
| System Designer / Architect | Joshua Gutierrez |
| AI/CV Developer (Python / YOLOv11) | Jhocer Barcela |
| Hardware Developer (ESP32) | Dranreb Wen Balangbang |
| Web Dashboard Developer | Arabella Jarapa |
| QA Tester / Documentation | Josiel De Rosa |

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Goals](#2-system-goals)
3. [High-Level System Architecture](#3-high-level-system-architecture)
4. [End-to-End System Workflow](#4-end-to-end-system-workflow)
5. [Core System Components](#5-core-system-components)
6. [Detailed Data Flow](#6-detailed-data-flow)
7. [AI / Computer Vision Pipeline](#7-ai--computer-vision-pipeline)
8. [Algorithm Design](#8-algorithm-design)
9. [Data Structures Used](#9-data-structures-used)
10. [Database Design](#10-database-design)
11. [API Design](#11-api-design)
12. [IoT Communication Architecture](#12-iot-communication-architecture)
13. [Real-Time Dashboard Architecture](#13-real-time-dashboard-architecture)
14. [Hardware Architecture](#14-hardware-architecture)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Scalability Design](#16-scalability-design)
17. [Security Architecture](#17-security-architecture)
18. [Performance Optimization](#18-performance-optimization)
19. [Fault Tolerance](#19-fault-tolerance)
20. [Development Roadmap](#20-development-roadmap)
21. [Testing Strategy](#21-testing-strategy)
22. [Future Improvements](#22-future-improvements)

---

# 1. Executive Summary

## 1.1 Overview

AquaGuard is an intelligent, IoT-enabled drowning detection and real-time alert system designed for deployment in aquatic facilities such as public swimming pools, resort pools, and recreational water parks across the Philippines. It directly addresses one of the most critical public safety challenges in aquatic environments: the silent and rapid nature of drowning incidents, which can cause irreversible neurological damage within 4–6 minutes and death shortly thereafter — often without the gasping or splashing sounds that most bystanders associate with drowning distress.

## 1.2 The Real-World Problem

Drowning is the **3rd leading cause of unintentional injury-related deaths worldwide**, accounting for approximately 236,000 fatalities annually according to the World Health Organization. In the Philippines, drowning incidents in public swimming pools, beach resorts, and recreational water facilities are consistently reported, particularly during peak holiday seasons when aquatic facilities are most crowded and lifeguard attention is most strained.

The current industry-standard prevention approach relies entirely on human lifeguards performing continuous visual surveillance — an inherently reactive and failure-prone method. Human attention degrades significantly over sustained monitoring periods; studies have shown that lifeguard detection effectiveness drops measurably after 20–30 minutes of continuous scanning. During peak hours with high swimmer density, the probability that a drowning event is detected within the critical 60–90 second window decreases further.

Existing commercial automated solutions — such as the Poseidon system — are priced beyond the operational budget of small to medium Philippine aquatic facilities, and most sensor-based alternatives require physical contact with the swimmer, making them impractical for public pools.

## 1.3 The AquaGuard Solution

AquaGuard integrates computer vision, pose estimation AI, edge computing, and IoT hardware into a unified, always-on safety system. IP cameras continuously monitor the pool surface. A multi-stage AI pipeline — using YOLOv11 for person detection and MediaPipe Pose for body posture landmark analysis — evaluates every swimmer's behavior in real time. A confidence threshold algorithm prevents false positives by requiring sustained detection across a rolling 15-frame window before triggering any alert.

When a drowning event is confirmed, the system acts on four parallel channels simultaneously:

1. Sends an MQTT signal to an ESP32 microcontroller, which physically activates an audible alarm (buzzer/siren) via GPIO output.
2. Pushes a real-time WebSocket alert to the web monitoring dashboard visible to on-site lifeguards and administrators.
3. Logs the incident to a relational database with timestamp, camera zone, detection confidence score, and a snapshot frame.
4. Presents the incident in the dashboard incident history for future review and pattern analysis.

The entire detection-to-alert pipeline is designed to operate within a **sub-3-second latency budget**, reducing the critical detection gap from 20–60 seconds (human average) to under 3 seconds.

## 1.4 Project Classification

AquaGuard is classified as a **New / Startup-Oriented System** under the Mabini Colleges, Inc. Software Engineering project guidelines. It targets a clearly defined market segment — small to medium Philippine aquatic facility operators — and is designed with open-source, locally accessible components to ensure deployability at a fraction of the cost of commercial alternatives. The system is standards-compliant with ISO/IEC 12207, ISO/IEC 25010, and IEEE 29148.

---

# 2. System Goals

## 2.1 Functional Goals

- **FR-01 (High):** Continuously detect drowning behavior from a live camera feed in real time using YOLOv11 and MediaPipe Pose.
- **FR-02 (High):** Trigger the ESP32 physical alarm within 3 seconds of a confirmed drowning detection event.
- **FR-03 (High):** Send a push notification to the web dashboard via WebSocket upon detection confirmation.
- **FR-04 (High):** Log all detection events to the database with timestamp, camera zone ID, confidence score, and frame snapshot.
- **FR-05 (High):** Apply a rolling-window confidence threshold filter to suppress false positive alerts before actuation.
- **FR-06 (Medium):** Support simultaneous monitoring of multiple camera zones from a single dashboard and processing pipeline.
- **FR-07 (Medium):** Allow authorized staff to view live camera feeds directly within the web dashboard.
- **FR-08 (Low):** Generate exportable incident reports aggregated from the logged detection event history.

## 2.2 Safety Goals

- Reduce drowning detection latency from an average of 20–60 seconds (human lifeguard) to under 3 seconds (automated).
- Ensure no confirmed drowning event goes unalerted due to system failure by implementing fault-tolerant fallback behavior.
- Prevent alert fatigue caused by false positives through the multi-frame confidence scoring mechanism.
- Maintain system availability at 99% or higher during all aquatic facility operational hours.
- Ensure physical alarm activation is independent of network connectivity to the dashboard where possible.

## 2.3 Performance Targets

| Metric | Target |
|---|---|
| Detection-to-alert latency | ≤ 3 seconds end-to-end |
| YOLOv11 inference time per frame | ≤ 25 ms (CUDA-accelerated, RTX 2050) |
| MediaPipe pose estimation per frame | ≤ 15 ms |
| Rolling window evaluation | ≤ 5 ms per cycle |
| MQTT signal transmission to ESP32 | ≤ 200 ms |
| Dashboard WebSocket push latency | ≤ 500 ms |
| System uptime during operation | ≥ 99% |
| False positive rate (post-filter) | < 5% in controlled conditions |
| Minimum camera resolution | 720p (1280×720) @ 15–30 FPS |
| Minimum detection frame rate | 15 FPS for reliable pose tracking |

---

# 3. High-Level System Architecture

## 3.1 Architecture Pattern

AquaGuard follows a **Layered Edge-AI + IoT Architecture**, combining the structural clarity of a layered design with the performance advantages of edge computing and the physical actuation capability of IoT hardware. The architecture is composed of six distinct layers:

| Layer | Component | Technology |
|---|---|---|
| Perception Layer | IP Camera + RTSP capture | OpenCV, RTSP protocol |
| AI Processing Layer | YOLOv11 detection + MediaPipe Pose | Python, Ultralytics, MediaPipe |
| Decision Layer | Confidence filter + Alert engine | Python, collections.deque |
| Communication Layer | MQTT broker + WebSocket server | Mosquitto MQTT, Flask-SocketIO |
| Actuation Layer | ESP32 GPIO-triggered physical alarm | ESP32, Arduino/MicroPython |
| Presentation Layer | React web dashboard + REST API | React.js, Flask, SQLite/MySQL |

## 3.2 Architecture Explanation

The **Perception Layer** is the entry point. One or more IP cameras stream video over RTSP into OpenCV capture pipelines running on the edge detection server (Lenovo LOQ with RTX 2050). Frames are decoded and preprocessed (resized, normalized) before being fed into the AI layer.

The **AI Processing Layer** is the computational core. YOLOv11 performs single-pass object detection on each frame, identifying persons in the water and producing bounding boxes with class confidence scores. Detected persons are then cropped and passed to MediaPipe Pose, which extracts 33 body landmark coordinates per swimmer. Both sets of outputs are forwarded to the Decision Layer.

The **Decision Layer** applies the rule-based drowning behavior analyzer and the rolling-window confidence threshold filter. It maintains a deque buffer per detected person per camera zone. When the weighted confidence score breaches the threshold across K consecutive frames, it elevates an alert to the Communication Layer via the Alert Decision Engine.

The **Communication Layer** is bifurcated: MQTT handles the real-time IoT signal path to the ESP32, and WebSocket (via Flask-SocketIO) handles the real-time browser push path to the dashboard. The Flask REST API also serves historical data and authentication.

The **Actuation Layer** is handled entirely by the ESP32 microcontroller. It subscribes to the MQTT topic `aquaguard/alert`, and upon receiving an alert message, drives a GPIO pin HIGH to trigger a connected buzzer or relay-controlled siren.

The **Presentation Layer** is the React web dashboard. It connects to the WebSocket server for live alerts, polls the Flask REST API for historical events and camera status, and displays live MJPEG or HLS streams from the cameras.

## 3.3 High-Level Architecture Diagram

```mermaid
graph TB
    subgraph PerceptionLayer["Perception Layer"]
        CAM1["IP Camera 1\n(RTSP)"]
        CAM2["IP Camera 2\n(RTSP)"]
    end

    subgraph AILayer["AI Processing Layer (Edge Server - RTX 2050)"]
        OCV["OpenCV\nFrame Capture & Preprocessing"]
        YOLO["YOLOv11\nPerson Detection"]
        MP["MediaPipe Pose\nLandmark Extraction"]
    end

    subgraph DecisionLayer["Decision Layer"]
        BHA["Drowning Behavior\nAnalyzer"]
        FPF["False Positive Filter\n(Rolling Window Deque)"]
        ADE["Alert Decision\nEngine"]
    end

    subgraph CommsLayer["Communication Layer"]
        MQTT["MQTT Broker\n(Mosquitto)"]
        WS["WebSocket Server\n(Flask-SocketIO)"]
        FLASK["Flask REST API"]
    end

    subgraph ActuationLayer["Actuation Layer"]
        ESP["ESP32\nMicrocontroller"]
        ALARM["Physical Alarm\n(Buzzer / Siren)"]
    end

    subgraph PresentationLayer["Presentation Layer"]
        DASH["React Web Dashboard"]
        DB["SQLite / MySQL\nDatabase"]
    end

    CAM1 --> OCV
    CAM2 --> OCV
    OCV --> YOLO
    YOLO --> MP
    MP --> BHA
    BHA --> FPF
    FPF --> ADE
    ADE --> MQTT
    ADE --> WS
    ADE --> FLASK
    FLASK --> DB
    MQTT --> ESP
    ESP --> ALARM
    WS --> DASH
    FLASK --> DASH
```text

---

# 4. End-to-End System Workflow

## 4.1 Step-by-Step Workflow

**Step 1 — Frame Capture:** OpenCV opens an RTSP stream for each configured camera. Frames are captured at the source frame rate (15–30 FPS) and placed in a processing queue.

**Step 2 — Preprocessing:** Each frame is resized to 640×640 (YOLOv11 input size), normalized to float32, and converted from BGR to RGB.

**Step 3 — YOLOv11 Inference:** The preprocessed frame tensor is passed through the YOLOv11s (small) model running on CUDA (RTX 2050). The model returns bounding boxes, class labels (`drowning`, `swimming`, `person_out_of_water`), and confidence scores for all detected objects.

**Step 4 — Pose Estimation:** For each detected person bounding box, the cropped ROI is passed to MediaPipe Pose. MediaPipe returns 33 normalized (x, y, z, visibility) landmark coordinates representing key body joints and facial points.

**Step 5 — Behavior Analysis:** The Drowning Behavior Analyzer evaluates the pose landmarks against a rule set. Indicators include vertical body orientation, arms elevated above shoulder line, absence of horizontal limb displacement (non-swimming motion), and inferred facial submersion.

**Step 6 — Confidence Scoring:** The behavior analyzer emits a per-frame confidence score (0.0–1.0) for each tracked person. This score is appended to the person's dedicated deque buffer (capacity N=15 frames).

**Step 7 — False Positive Filtering:** The rolling window filter computes the mean weighted confidence across the deque. If the mean exceeds threshold T=0.75 and K=10 consecutive frames have each individually exceeded 0.65, the filter passes the event to the Alert Decision Engine.

**Step 8 — Alert Decision:** The Alert Decision Engine constructs an alert payload containing camera zone ID, detection timestamp, confidence score, and a JPEG snapshot of the trigger frame. It simultaneously dispatches this payload via MQTT and WebSocket, and logs it via the Flask API to the database.

**Step 9 — MQTT → ESP32:** The MQTT broker relays the alert to the ESP32, which is subscribed on `aquaguard/alert`. The ESP32 firmware parses the message and drives GPIO pin HIGH for a configured duration, activating the buzzer/siren.

**Step 10 — Dashboard Alert:** The React dashboard receives the WebSocket event and immediately renders a full-screen alert overlay with the incident details, camera zone, confidence level, and the frame snapshot. The lifeguard can acknowledge the alert, which is recorded in the database.

**Step 11 — Incident Logging:** The Flask API endpoint records the full event to the `detection_events` and `alerts` tables with all metadata. The event becomes available in the dashboard's incident history view for review and report generation.

## 4.2 Sequence Diagram

```mermaid
sequenceDiagram
    participant CAM as IP Camera
    participant OCV as OpenCV Engine
    participant YOLO as YOLOv11
    participant MP as MediaPipe Pose
    participant BHA as Behavior Analyzer
    participant FPF as False Positive Filter
    participant ADE as Alert Engine
    participant MQTT as MQTT Broker
    participant ESP as ESP32
    participant ALARM as Physical Alarm
    participant FLASK as Flask API
    participant DB as Database
    participant WS as WebSocket Server
    participant DASH as React Dashboard

    loop Every Frame (15-30 FPS)
        CAM->>OCV: RTSP video frame
        OCV->>YOLO: Preprocessed frame tensor (640×640)
        YOLO-->>OCV: Bounding boxes + class labels + confidence
        OCV->>MP: Cropped person ROI per bounding box
        MP-->>BHA: 33 pose landmarks per person
        BHA-->>FPF: Per-frame confidence score (0.0–1.0)
        FPF-->>FPF: Append to deque (N=15 frames)
        FPF-->>FPF: Evaluate: mean > T=0.75 AND K=10 consec frames?
    end

    alt Drowning Confirmed
        FPF->>ADE: Alert payload (zone, timestamp, confidence, snapshot)
        ADE->>MQTT: Publish to aquaguard/alert
        ADE->>FLASK: POST /api/events (log incident)
        ADE->>WS: Emit alert_event to connected dashboard clients
        FLASK->>DB: INSERT detection_events + alerts
        MQTT->>ESP: Subscribe message received
        ESP->>ALARM: GPIO HIGH → Buzzer/Siren activated
        WS->>DASH: Real-time alert pushed
        DASH-->>DASH: Render full-screen alert overlay
        DASH->>FLASK: POST /api/acknowledge-alert (lifeguard confirms)
        FLASK->>DB: UPDATE alert status = acknowledged
    end
```text

---

# 5. Core System Components

## 5.1 Camera Input Module

**Responsibilities:** Establishes and maintains RTSP or USB video streams from one or more IP cameras. Handles frame acquisition, buffering, and preprocessing before forwarding frames to the detection engine. Also manages camera heartbeat monitoring and reconnection on stream failure.

**Inputs:** RTSP stream URL(s) or USB device index configured via the camera registry hash map.

**Outputs:** Preprocessed BGR frames (numpy arrays), frame metadata (camera ID, zone ID, capture timestamp).

**Technologies:** Python 3.11, OpenCV `VideoCapture`, threading for per-camera stream isolation.

**Key Implementation Notes:**

- Each camera runs in an isolated thread with its own `cv2.VideoCapture` instance.
- Frame rate throttling is applied (process every Nth frame) to balance load versus detection coverage.
- On `CAP_PROP_POS_FRAMES` stall or connection timeout, the module triggers an automatic reconnect loop with exponential backoff.
- Frames are resized to 640×640 for YOLOv11 input normalization.

---

## 5.2 Computer Vision Detection Engine (YOLOv11)

**Responsibilities:** Runs YOLOv11 inference on each preprocessed frame to detect persons and classify their state (`drowning`, `swimming`, `person_out_of_water`). Returns bounding boxes, class labels, and per-detection confidence scores.

**Inputs:** 640×640 normalized frame tensor (float32, RGB).

**Outputs:** List of detection objects — each containing bounding box coordinates (x1, y1, x2, y2), class label string, and confidence float (0.0–1.0).

**Technologies:** Python 3.11, Ultralytics YOLOv11 (`ultralytics` library), CUDA (NVIDIA RTX 2050 4GB GDDR6), PyTorch.

**Model Details:**

- **Base model:** YOLOv11s (small variant — trained on Kaggle, higher mAP than nano at the cost of ~2.0–2.2 GB VRAM)
- **Fine-tuning dataset:** Swimming and Drowning Detection Dataset (Roboflow Universe, University, 2024) — 7,295 images, 3 classes (Drowning / Swimming / Person Out of Water), CC BY 4.0
- **Validated mAP:** 90.1% on the equivalent YOLOv8 baseline (ETASR Journal); YOLOv11s is expected to match or exceed this with improved accuracy over the nano variant.
- **Inference time:** ~21–25 ms per frame on RTX 2050 (CUDA)
- **Time complexity:** O(1) per frame — single forward pass through the CNN

---

## 5.3 Pose Estimation Module (MediaPipe Pose)

**Responsibilities:** For each person detected by YOLOv11, performs full-body pose landmark estimation to extract 33 keypoint coordinates used for drowning posture analysis.

**Inputs:** Cropped person ROI (region of interest) extracted from the original frame using YOLOv11 bounding box coordinates.

**Outputs:** Array of 33 normalized landmarks per person, each containing (x, y, z, visibility) — where x and y are normalized to [0,1] relative to the ROI, z is relative depth, and visibility is detection confidence per landmark.

**Technologies:** Google MediaPipe (`mediapipe` Python library), NumPy.

**Key Landmarks Used:**

| Landmark Index | Body Part | Role in Analysis |
|---|---|---|
| 0 | Nose | Facial submersion detection |
| 11, 12 | Left/Right Shoulder | Arm elevation reference |
| 13, 14 | Left/Right Elbow | Arm motion analysis |
| 15, 16 | Left/Right Wrist | Stroke pattern analysis |
| 23, 24 | Left/Right Hip | Body orientation axis |
| 25, 26 | Left/Right Knee | Leg kick detection |
| 27, 28 | Left/Right Ankle | Propulsion analysis |

---

## 5.4 Drowning Behavior Analyzer

**Responsibilities:** Applies a rule-based expert system to the MediaPipe pose landmarks and YOLOv11 class labels to produce a per-frame drowning confidence score. Acts as the domain knowledge layer that encodes observable drowning behavior into evaluable conditions.

**Inputs:** 33 pose landmarks per person (normalized x, y, z, visibility), YOLOv11 class label and confidence score.

**Outputs:** Normalized drowning confidence score (float, 0.0–1.0) per person per frame.

**Technologies:** Python, NumPy.

**Drowning Posture Indicators:**

1. **Vertical body orientation:** The vector from hip midpoint to shoulder midpoint is near-vertical (within 30° of vertical axis) for more than 3 consecutive frames without horizontal displacement — indicating the swimmer is upright and stationary, not swimming.

2. **Arms elevated above shoulder line:** Both wrist landmarks (15, 16) are positioned above both shoulder landmarks (11, 12) in the Y-axis, indicating arms raised out of water in a distress gesture.

3. **Absence of rhythmic limb motion:** No oscillatory horizontal displacement is detected in elbow or ankle landmarks over a 10-frame window, distinguishing a stationary drowning posture from active swimming.

4. **Inferred facial submersion:** Nose landmark (0) visibility score drops below 0.4, suggesting the face is underwater or submerged below the camera's line of sight.

5. **YOLOv11 class label boost:** If YOLOv11 directly classifies a person as `drowning` with confidence > 0.6, the pose analyzer's output score is boosted by a weighted factor.

The final confidence score is a weighted combination of these five indicators, normalized to [0, 1].

---

## 5.5 False Positive Filter

**Responsibilities:** Prevents spurious single-frame detections from triggering alarms. Maintains a rolling deque buffer of per-frame confidence scores per tracked person and evaluates whether sustained drowning behavior is occurring.

**Inputs:** Per-frame drowning confidence score from the Behavior Analyzer, camera zone ID, tracked person ID.

**Outputs:** Boolean gate — pass (True) or suppress (False) — forwarded to the Alert Decision Engine.

**Technologies:** Python `collections.deque`, NumPy.

**Algorithm Parameters:**

| Parameter | Description | Value |
|---|---|---|
| N | Rolling window size (frames) | 15 |
| T | Mean confidence threshold to trigger alert | 0.75 |
| K | Minimum consecutive frames above 0.65 | 10 |
| Time Complexity | Rolling window evaluation per frame | O(N) |

**Logic:** Each new confidence score is appended to the deque (maxlen=N). When the deque is full, the filter checks: (1) the rolling mean exceeds T, and (2) the last K entries are all individually above 0.65. If both conditions hold, the filter passes the event. This two-condition design prevents a single high-confidence spike from triggering an alert while also preventing diluted averages that barely exceed the mean threshold.

---

## 5.6 Alert Decision Engine

**Responsibilities:** Orchestrates the multi-channel alert dispatch once the False Positive Filter clears an event. Constructs the alert payload, routes it to MQTT and WebSocket simultaneously, and submits the incident record to the Flask API.

**Inputs:** Alert clearance signal from the False Positive Filter, alert metadata (camera zone, person track ID, confidence score, frame snapshot).

**Outputs:** MQTT publish call, WebSocket emit call, HTTP POST to Flask `/api/events`.

**Technologies:** Python, `paho-mqtt`, `python-socketio` or Flask-SocketIO client, `requests`.

**Payload Structure (JSON):**

```json
{
  "event_id": "uuid-v4",
  "camera_zone_id": "zone_01",
  "timestamp": "2026-03-12T10:42:33.512Z",
  "confidence_score": 0.87,
  "person_track_id": "track_003",
  "frame_snapshot_b64": "<base64-encoded JPEG>",
  "alert_type": "drowning_confirmed",
  "status": "unacknowledged"
}
```text

---

## 5.7 ESP32 IoT Controller

**Responsibilities:** Receives MQTT alert messages from the broker and physically activates the on-site alarm hardware via GPIO. Provides the physical-world actuation layer that operates independently of the dashboard.

**Inputs:** MQTT message on topic `aquaguard/alert` (JSON payload).

**Outputs:** GPIO pin HIGH signal → buzzer/relay-controlled siren activation. GPIO pin LOW after configurable alarm duration or upon receipt of MQTT `aquaguard/alert/reset` message.

**Technologies:** ESP32-WROOM-32 microcontroller, Arduino IDE (C++) or MicroPython, `PubSubClient` MQTT library (Arduino) or `umqtt.simple` (MicroPython).

**Hardware Specs:**

- Dual-core Xtensa LX6 @ 240 MHz
- Wi-Fi 802.11 b/g/n
- 4 MB Flash
- GPIO output: 3.3V logic level → relay module → 5V buzzer/siren

---

## 5.8 Backend API (Flask)

**Responsibilities:** Serves as the RESTful backend between the React dashboard, the detection pipeline, and the database. Handles authentication, event logging, alert acknowledgment, camera registration, and report generation.

**Inputs:** HTTP requests from React dashboard, internal POST calls from Alert Decision Engine.

**Outputs:** JSON responses to dashboard, database writes/reads via SQLAlchemy ORM.

**Technologies:** Python Flask, Flask-SocketIO (WebSocket), Flask-JWT-Extended (auth), SQLAlchemy, SQLite (development) / MySQL (production).

---

## 5.9 Web Dashboard (React)

**Responsibilities:** Real-time monitoring interface for lifeguards and facility administrators. Displays live camera feeds, active alerts, incident history, camera zone status, and system health.

**Inputs:** WebSocket events (live alerts), REST API responses (events, cameras, reports), MJPEG/HLS streams from cameras.

**Outputs:** Rendered UI components, HTTP requests to Flask API (login, acknowledge alert, fetch reports).

**Technologies:** React.js, WebSocket API, Axios (HTTP), Recharts (analytics charts), Tailwind CSS.

---

## 5.10 Logging and Analytics Module

**Responsibilities:** Persists all detection events, alert dispatches, acknowledgments, and system logs to the relational database. Supports report generation queries for incident history analysis.

**Inputs:** Event payloads from Alert Decision Engine, system health status updates, user actions from dashboard.

**Outputs:** Populated `detection_events`, `alerts`, and `system_logs` database tables. Exportable report data (JSON/CSV).

**Technologies:** SQLAlchemy ORM, SQLite (dev) / MySQL (production).

---

# 6. Detailed Data Flow

## 6.1 Data Flow Explanation

Data in AquaGuard flows through five distinct transformation stages:

**Stage 1 — Raw Video Stream:** IP cameras emit continuous RTSP streams at 15–30 FPS. OpenCV reads these as raw BGR frame matrices. No intelligence is applied at this stage; frames are simply captured and queued.

**Stage 2 — Inference Outputs:** Frames pass through YOLOv11 and MediaPipe Pose. Both models produce structured numerical outputs — bounding boxes, class scores, and landmark coordinates. These are transient, in-memory data structures (Python lists and NumPy arrays) with no persistence.

**Stage 3 — Behavioral Scores:** The Behavior Analyzer and False Positive Filter transform the raw inference outputs into a single boolean gate decision per tracked person per frame cycle. A deque buffer maintains state across frames without requiring a full time-series database.

**Stage 4 — Alert Event:** When the gate opens, a structured JSON alert payload is constructed. This payload is the primary event object that flows outward across three channels: MQTT (to ESP32), WebSocket (to dashboard), and HTTP POST (to database via Flask).

**Stage 5 — Persisted Record:** The Flask API writes the event to the relational database. From this point, the data is at rest and queryable for history, analytics, and reports.

## 6.2 Data Flow Diagram (DFD)

```mermaid
flowchart LR
    CAM[/"IP Camera\n(RTSP Stream)"/]
    OCV["OpenCV\nFrame Decoder"]
    YOLO["YOLOv11\nInference"]
    MP["MediaPipe\nPose"]
    BHA["Behavior\nAnalyzer"]
    DEQUE[("Deque\nBuffer\nN=15")]
    FPF{"False Positive\nFilter\n mean > 0.75\nK=10 frames"}
    ADE["Alert Decision\nEngine"]
    MQTT(["MQTT Broker\nMosquitto"])
    ESP[["ESP32\nController"]]
    ALARM[/"Physical\nAlarm"/]
    FLASK["Flask\nREST API"]
    DB[("SQLite /\nMySQL DB")]
    WS[["WebSocket\nServer"]]
    DASH[/"React\nDashboard"/]

    CAM -->|BGR frames| OCV
    OCV -->|640×640 tensor| YOLO
    YOLO -->|Bounding boxes\n+ class labels| MP
    MP -->|33 landmarks\nper person| BHA
    BHA -->|Confidence\nscore 0-1| DEQUE
    DEQUE -->|Rolling window| FPF
    FPF -->|"PASS (confirmed)"| ADE
    FPF -->|"SUPPRESS (no alert)"| DEQUE
    ADE -->|JSON alert payload| MQTT
    ADE -->|JSON alert payload| FLASK
    ADE -->|JSON alert payload| WS
    MQTT -->|MQTT message| ESP
    ESP -->|GPIO HIGH| ALARM
    FLASK -->|INSERT event| DB
    DB -->|Query results| FLASK
    FLASK -->|JSON response| DASH
    WS -->|WebSocket event| DASH
```text

---

# 7. AI / Computer Vision Pipeline

## 7.1 Pipeline Overview

The AquaGuard CV pipeline is a sequential multi-stage inference loop that processes video frames from capture to behavioral decision. It is designed to execute within a per-frame time budget of approximately 33ms (corresponding to 30 FPS), with individual stage time allocations:

| Stage | Operation | Time Budget (CUDA) |
|---|---|---|
| Frame capture & decode | OpenCV RTSP | ~5 ms |
| Preprocessing (resize, normalize) | NumPy/OpenCV | ~2 ms |
| YOLOv11s inference | CUDA forward pass | ~21–25 ms |
| MediaPipe Pose estimation | CPU (per person) | ~8 ms |
| Behavior analysis | NumPy rule evaluation | ~2 ms |
| Deque update + filter check | Python collections | ~1 ms |
| **Total per frame** | | **~31.5 ms** |

This pipeline fits within approximately 55ms per frame for real-time 15–20 FPS processing on the RTX 2050 hardware — comfortably within the sub-3-second alert budget even at reduced frame rates.

## 7.2 Inference Loop (Frame Processing Pipeline)

```python
# Pseudocode — AquaGuard CV Inference Loop

import cv2
from ultralytics import YOLO
import mediapipe as mp
from collections import deque

model = YOLO("aquaguard_yolov11s.pt")  # Fine-tuned model (small variant, trained on Kaggle)
pose = mp.solutions.pose.Pose()
confidence_buffers = {}  # hash map: track_id -> deque(maxlen=15)

cap = cv2.VideoCapture("rtsp://camera_ip/stream")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        handle_reconnect()
        continue

    # Stage 1: YOLOv11 inference
    results = model.track(frame, persist=True, conf=0.4)

    for detection in results[0].boxes:
        track_id = detection.id
        class_label = detection.cls  # 0=drowning, 1=swimming, 2=out_of_water
        yolo_conf = detection.conf

        # Stage 2: Crop ROI for pose estimation
        x1, y1, x2, y2 = detection.xyxy
        roi = frame[y1:y2, x1:x2]

        # Stage 3: MediaPipe Pose
        landmarks = pose.process(cv2.cvtColor(roi, cv2.COLOR_BGR2RGB))

        # Stage 4: Behavior analysis
        score = analyze_drowning_behavior(landmarks, class_label, yolo_conf)

        # Stage 5: Deque buffer update
        if track_id not in confidence_buffers:
            confidence_buffers[track_id] = deque(maxlen=15)
        confidence_buffers[track_id].append(score)

        # Stage 6: False positive filter
        if evaluate_rolling_window(confidence_buffers[track_id]):
            dispatch_alert(track_id, score, frame)
```text

## 7.3 Detection Confidence Logic

The confidence scoring logic combines three weighted signals:

```text
final_score = (
    0.40 × pose_behavior_score     +   # Landmark-based posture rules
    0.35 × yolo_class_confidence   +   # YOLOv11 'drowning' class score
    0.25 × temporal_consistency_score  # Consistency across last 5 frames
)
```text

The **temporal consistency score** is computed as the ratio of frames in the last 5 entries of the deque that exceeded 0.5, rewarding sustained detections over spike detections.

---

# 8. Algorithm Design

## 8.1 YOLOv11 Detection Algorithm

YOLOv11 (You Only Look Once, version 11) is a single-stage real-time object detection algorithm based on a convolutional neural network architecture. The key characteristic that makes it suitable for AquaGuard is its **single forward pass inference model**: the entire image is processed simultaneously by the CNN, which divides the image into an S×S grid and predicts bounding boxes, objectness scores, and class probabilities for each grid cell in one pass.

**Time Complexity:** O(1) per frame — the number of operations is fixed regardless of the number of detected objects (bounded by the grid size). This is fundamentally more efficient than two-stage detectors like Faster R-CNN, which have O(k) complexity where k is the number of region proposals.

**Why YOLOv11 over YOLOv8:** YOLOv11 achieves higher mAP with 22% fewer parameters and comparable inference speed on the same hardware. For AquaGuard's sub-3-second total pipeline budget, the speed advantage is architecturally significant even at the small variant scale.

**Model variant:** YOLOv11s (small) was trained on Kaggle using the Roboflow drowning detection dataset. It offers better accuracy than the nano variant at the cost of ~2.0–2.2 GB VRAM and ~21–25 ms inference time per frame — both well within the RTX 2050's 4 GB GDDR6 capacity and the 3-second alert window.

## 8.2 Pose Landmark Evaluation

MediaPipe Pose uses a two-step detector-tracker pipeline. A lightweight pose detector first localizes the person, and a dedicated pose landmark model then predicts 33 keypoints with sub-pixel accuracy. The tracker propagates landmarks across frames using optical flow, reducing the cost of re-detection on subsequent frames.

For drowning analysis, the following landmark comparisons are evaluated per frame:

- **Vertical orientation check:** `angle(shoulder_midpoint, hip_midpoint, vertical_axis) < 30°`
- **Arm elevation check:** `(left_wrist.y < left_shoulder.y) AND (right_wrist.y < right_shoulder.y)` (note: in image coordinates, smaller Y = higher in frame)
- **Motion absence check:** `std_dev(wrist_x_positions[last_10_frames]) < 15px`
- **Submersion check:** `nose.visibility < 0.4`

## 8.3 Drowning Posture Indicators Summary

| Indicator | Landmark(s) Used | Threshold | Weight |
|---|---|---|---|
| Vertical body orientation | Shoulder midpoint (11,12), Hip midpoint (23,24) | Angle < 30° from vertical | 0.30 |
| Arms above shoulder line | Wrists (15,16), Shoulders (11,12) | Both wrists above both shoulders | 0.25 |
| Absence of limb motion | Wrists (15,16), Ankles (27,28) | Std dev < 15px over 10 frames | 0.20 |
| Facial submersion | Nose (0) | visibility < 0.4 | 0.15 |
| YOLO class confirmation | YOLOv11 output | class='drowning' AND conf > 0.6 | 0.10 |

## 8.4 Confidence Threshold Filtering Algorithm

The rolling window algorithm is designed to distinguish a genuine drowning event from brief false-positive frames (e.g., a swimmer pushing off a wall vertically, or diving into the pool).

**Two-condition gate:**

1. Rolling mean of the last N=15 frames must exceed T=0.75.
2. At least K=10 of the last 15 frames must individually exceed 0.65.

The second condition prevents a scenario where 5 very high-confidence frames (e.g., 0.95) inflate the mean above 0.75 despite the other 10 frames being low-confidence.

## 8.5 Rolling Frame Window Pseudocode

```text
ALGORITHM: DrowningConfirmationFilter
INPUT: confidence_score (float), track_id (string), camera_zone_id (string)
OUTPUT: alert_triggered (boolean)

CONSTANTS:
    N = 15        # rolling window size
    T = 0.75      # mean confidence threshold
    K = 10        # minimum consecutive frames above low_threshold
    LOW_T = 0.65  # per-frame low threshold for K condition

BEGIN
    buffer = get_or_create_deque(track_id, maxlen=N)
    buffer.append(confidence_score)

    IF len(buffer) < N THEN
        RETURN False   # not enough data yet

    rolling_mean = mean(buffer)
    consecutive_count = count(score > LOW_T for score in buffer[-K:])

    IF rolling_mean > T AND consecutive_count >= K THEN
        reset_buffer(track_id)   # prevent repeated alerts for same event
        RETURN True
    ELSE
        RETURN False
END
```text

## 8.6 Full Drowning Detection Logic Pseudocode

```text
ALGORITHM: AquaGuardDetectionCycle
INPUT: video_frame (BGR image), camera_zone_id (string)
OUTPUT: none (side effects: alert dispatch, database log)

BEGIN
    # === Stage 1: YOLO Detection ===
    detections = YOLO.infer(preprocess(video_frame))

    FOR EACH detection IN detections DO
        IF detection.class NOT IN ['drowning', 'swimming', 'person_out_of_water'] THEN
            CONTINUE

        track_id = detection.track_id
        roi = crop_frame(video_frame, detection.bounding_box)

        # === Stage 2: Pose Estimation ===
        landmarks = MediaPipe.estimate_pose(roi)
        IF landmarks IS NULL THEN
            CONTINUE

        # === Stage 3: Behavior Analysis ===
        score = 0.0
        score += 0.30 IF is_vertical_orientation(landmarks)
        score += 0.25 IF are_arms_elevated(landmarks)
        score += 0.20 IF no_limb_motion(track_id, landmarks)
        score += 0.15 IF is_face_submerged(landmarks)
        score += 0.10 IF (detection.class == 'drowning' AND detection.conf > 0.6)

        # === Stage 4: Temporal consistency bonus ===
        score = apply_temporal_consistency(score, track_id)

        # === Stage 5: Rolling window filter ===
        alert_triggered = DrowningConfirmationFilter(score, track_id, camera_zone_id)

        IF alert_triggered THEN
            payload = build_alert_payload(
                camera_zone_id, track_id, score, video_frame, timestamp=now()
            )
            PARALLEL DO:
                MQTT.publish("aquaguard/alert", payload)
                WebSocket.emit("alert_event", payload)
                Flask.post("/api/events", payload)
            END PARALLEL
    END FOR
END
```text

---

# 9. Data Structures Used

## 9.1 Deque Circular Buffer — Rolling Confidence Window

**Implementation:** Python `collections.deque(maxlen=15)`

**Purpose:** Maintains the last N=15 confidence scores per tracked person without requiring manual index management or memory reallocation. When a new score is appended and the deque is full, the oldest score is automatically discarded (O(1) append, O(1) discard).

**Why deque over list:** A Python list would require O(N) operations for a sliding window (`list.pop(0)` is O(N)). The deque's circular buffer implementation performs both append and discard in O(1), making it ideal for high-frequency per-frame evaluation at 15–30 FPS.

**Memory footprint:** 15 × float64 = 120 bytes per tracked person. For 20 simultaneous swimmers (high-density scenario), this is 2.4 KB — negligible.

## 9.2 Hash Map — Camera Zone Registry

**Implementation:** Python dictionary `{zone_id: CameraConfig}`

**Purpose:** Maps camera zone identifiers (e.g., `"zone_01"`, `"zone_02"`) to camera configuration objects containing RTSP URL, frame rate, resolution, and processing thread reference.

**Time Complexity:** O(1) average-case lookup by zone ID — critical for per-frame routing where the camera zone must be identified from every detection result.

**Usage:** Also used as the `confidence_buffers` map: `{track_id: deque}` — maps swimmer track IDs (assigned by YOLOv11's `persist=True` tracking) to their individual rolling confidence deques.

## 9.3 Priority Queue — Multi-Zone Alert Queue

**Implementation:** Python `heapq` module operating on a min-heap keyed by `(alert_priority, timestamp)`

**Purpose:** In a multi-camera deployment, multiple zones may generate alerts simultaneously. The priority queue ensures that alerts from zones with higher confidence scores or longer sustained detection are processed and dispatched first, minimizing the most critical response latency.

**Time Complexity:** O(log k) insert and O(log k) extract-min, where k is the number of concurrent alerts in the queue. In practice k is very small (typically 0–3), making this operationally O(1).

**Priority Key:** `priority = -confidence_score` (negated for min-heap to achieve max-priority behavior). Secondary key is `timestamp` to break ties in favor of older unprocessed alerts.

## 9.4 Relational Database — Incident Log Storage

**Implementation:** SQLite (development) / MySQL (production) via SQLAlchemy ORM

**Purpose:** Provides structured, queryable, persistent storage for all detection events, alert records, camera configurations, user accounts, and system logs. Supports complex queries for report generation (e.g., incidents by zone, by time window, by confidence band).

**Time Complexity:**

- INSERT: O(log N) with B-tree index on timestamp
- SELECT with indexed filter: O(log N)
- Full table scan (unindexed report queries): O(N)

All frequently queried columns (`timestamp`, `camera_zone_id`, `status`) are indexed.

---

# 10. Database Design

## 10.1 Schema Overview

AquaGuard uses a relational schema designed around five core entities: system users, physical camera zones, raw detection events, actionable alerts, and system operation logs.

## 10.2 Table Definitions

**`users`** — Stores authorized dashboard accounts (lifeguards, administrators).

**`camera_zones`** — Registry of all installed cameras with location and configuration data.

**`detection_events`** — Every frame-level detection result from the AI pipeline, including raw confidence.

**`alerts`** — Confirmed drowning alerts that passed the false positive filter and were dispatched.

**`system_logs`** — Operational system events (camera connect/disconnect, service restarts, errors).

## 10.3 ER Diagram

```mermaid
erDiagram
    USERS {
        int user_id PK
        string username
        string password_hash
        string role
        string email
        datetime created_at
        datetime last_login
        bool is_active
    }

    CAMERA_ZONES {
        int zone_id PK
        string zone_name
        string rtsp_url
        string location_description
        int frame_rate
        string resolution
        bool is_active
        datetime registered_at
    }

    DETECTION_EVENTS {
        int event_id PK
        int zone_id FK
        datetime detected_at
        string class_label
        float yolo_confidence
        float pose_confidence
        float final_confidence
        string person_track_id
        text frame_snapshot_path
        bool alert_triggered
    }

    ALERTS {
        int alert_id PK
        int event_id FK
        int zone_id FK
        int acknowledged_by FK
        datetime alerted_at
        datetime acknowledged_at
        string status
        string alert_type
        string mqtt_payload
    }

    SYSTEM_LOGS {
        int log_id PK
        int zone_id FK
        datetime logged_at
        string log_level
        string source_module
        text message
        string session_id
    }

    USERS ||--o{ ALERTS : "acknowledges"
    CAMERA_ZONES ||--o{ DETECTION_EVENTS : "generates"
    CAMERA_ZONES ||--o{ ALERTS : "sources"
    CAMERA_ZONES ||--o{ SYSTEM_LOGS : "associated with"
    DETECTION_EVENTS ||--|| ALERTS : "escalates to"
```text

## 10.4 Key Indexing Strategy

```sql
-- Frequently queried columns
CREATE INDEX idx_events_zone_time ON detection_events (zone_id, detected_at);
CREATE INDEX idx_events_alert_triggered ON detection_events (alert_triggered);
CREATE INDEX idx_alerts_status ON alerts (status);
CREATE INDEX idx_alerts_alerted_at ON alerts (alerted_at);
CREATE INDEX idx_logs_level_time ON system_logs (log_level, logged_at);
```text

---

# 11. API Design

## 11.1 API Overview

AquaGuard exposes a RESTful HTTP API via Flask. All endpoints return JSON. Authentication uses JWT (JSON Web Tokens) issued on login. Protected endpoints require the `Authorization: Bearer <token>` header.

**Base URL (local edge server):** `http://localhost:5000/api/v1`

## 11.2 Endpoint Reference

---

### `POST /auth/login`

Authenticates a user and returns a JWT access token.

**Request:**

```json
{
  "username": "lifeguard_01",
  "password": "secure_password"
}
```text

**Response (200 OK):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "user": {
    "user_id": 3,
    "username": "lifeguard_01",
    "role": "lifeguard"
  },
  "expires_in": 3600
}
```text

**Response (401 Unauthorized):**

```json
{ "error": "Invalid credentials" }
```text

---

### `GET /cameras`

Returns all registered camera zones. Requires authentication.

**Response (200 OK):**

```json
{
  "cameras": [
    {
      "zone_id": 1,
      "zone_name": "Main Pool - East",
      "rtsp_url": "rtsp://192.168.1.10/stream1",
      "location_description": "East side, full pool coverage",
      "frame_rate": 30,
      "resolution": "1280x720",
      "is_active": true
    }
  ]
}
```text

---

### `GET /events`

Returns paginated detection event history. Supports filtering by zone, date range, and alert status.

**Query Parameters:** `?zone_id=1&from=2026-03-01&to=2026-03-12&alert_triggered=true&page=1&limit=20`

**Response (200 OK):**

```json
{
  "total": 48,
  "page": 1,
  "limit": 20,
  "events": [
    {
      "event_id": 112,
      "zone_id": 1,
      "zone_name": "Main Pool - East",
      "detected_at": "2026-03-12T10:42:33Z",
      "class_label": "drowning",
      "final_confidence": 0.87,
      "person_track_id": "track_003",
      "alert_triggered": true,
      "frame_snapshot_path": "/snapshots/event_112.jpg"
    }
  ]
}
```text

---

### `GET /alerts`

Returns current and historical alert records. Supports `?status=unacknowledged` filter.

**Response (200 OK):**

```json
{
  "alerts": [
    {
      "alert_id": 55,
      "event_id": 112,
      "zone_id": 1,
      "zone_name": "Main Pool - East",
      "alerted_at": "2026-03-12T10:42:34Z",
      "status": "unacknowledged",
      "alert_type": "drowning_confirmed",
      "acknowledged_by": null,
      "acknowledged_at": null
    }
  ]
}
```text

---

### `POST /alerts/{alert_id}/acknowledge`

Marks an alert as acknowledged by the requesting user.

**Request:** _(No body required; user identity from JWT)_

**Response (200 OK):**

```json
{
  "alert_id": 55,
  "status": "acknowledged",
  "acknowledged_by": "lifeguard_01",
  "acknowledged_at": "2026-03-12T10:42:59Z"
}
```text

---

### `POST /events`

Internal endpoint — called by the Alert Decision Engine to log a confirmed detection event. Not exposed to dashboard clients directly.

**Request:**

```json
{
  "camera_zone_id": "zone_01",
  "detected_at": "2026-03-12T10:42:33.512Z",
  "class_label": "drowning",
  "yolo_confidence": 0.91,
  "pose_confidence": 0.83,
  "final_confidence": 0.87,
  "person_track_id": "track_003",
  "frame_snapshot_b64": "<base64-encoded JPEG>",
  "alert_triggered": true
}
```text

**Response (201 Created):**

```json
{ "event_id": 112, "alert_id": 55 }
```text

---

### `GET /reports/summary`

Returns aggregated incident counts for report generation.

**Query Parameters:** `?from=2026-03-01&to=2026-03-31&group_by=zone`

**Response (200 OK):**

```json
{
  "report_period": { "from": "2026-03-01", "to": "2026-03-31" },
  "total_detections": 74,
  "confirmed_alerts": 6,
  "false_positives_suppressed": 68,
  "by_zone": [
    { "zone_id": 1, "zone_name": "Main Pool - East", "alerts": 4 },
    { "zone_id": 2, "zone_name": "Kiddie Pool", "alerts": 2 }
  ]
}
```text

---

# 12. IoT Communication Architecture

## 12.1 MQTT Overview

AquaGuard uses MQTT (Message Queuing Telemetry Transport) as the IoT communication protocol between the Python detection backend and the ESP32 hardware actuator. MQTT's publish-subscribe model is ideal for this use case because it decouples the publisher (detection engine) from the subscriber (ESP32), enabling the alert path to function even if the dashboard is offline, and keeping the hardware response latency low (sub-200ms on a local LAN).

**MQTT Broker:** Eclipse Mosquitto — lightweight, open-source, runs on the same edge server as the detection engine.

**QoS Level:** QoS 1 (at-least-once delivery) is used for `aquaguard/alert` topics to guarantee the ESP32 receives every confirmed alert. QoS 0 (fire-and-forget) is used for status heartbeat topics.

## 12.2 MQTT Topic Structure

| Topic | Publisher | Subscriber | Purpose | QoS |
|---|---|---|---|---|
| `aquaguard/alert` | Detection Engine | ESP32 | Confirmed drowning alert dispatch | 1 |
| `aquaguard/alert/reset` | Dashboard / Admin | ESP32 | Silence active alarm remotely | 1 |
| `aquaguard/detection` | Detection Engine | Dashboard | Raw detection events (non-alert) | 0 |
| `aquaguard/device/status` | ESP32 | Dashboard, Backend | ESP32 heartbeat + health | 0 |
| `aquaguard/camera/{zone_id}/status` | Detection Engine | Dashboard | Camera connectivity status | 0 |

## 12.3 Alert Payload Example (MQTT)

**Topic:** `aquaguard/alert`

```json
{
  "event_id": "a7f3c9d2-1234-4b56-89ab-cde012345678",
  "alert_type": "drowning_confirmed",
  "camera_zone_id": "zone_01",
  "timestamp": "2026-03-12T10:42:33.512Z",
  "confidence_score": 0.87,
  "person_track_id": "track_003"
}
```text

## 12.4 ESP32 Message Flow

```text
ESP32 Boot Sequence:
  1. Connect to Wi-Fi SSID (stored in firmware config)
  2. Connect to MQTT broker at 192.168.1.x:1883
  3. Subscribe to: aquaguard/alert, aquaguard/alert/reset
  4. Publish heartbeat to aquaguard/device/status every 30 seconds

On aquaguard/alert received:
  1. Parse JSON payload
  2. Drive GPIO_PIN_ALARM HIGH
  3. Activate buzzer/siren for ALARM_DURATION seconds (configurable, default 30s)
  4. Publish acknowledgment to aquaguard/device/status

On aquaguard/alert/reset received:
  1. Drive GPIO_PIN_ALARM LOW
  2. Stop alarm immediately
  3. Publish reset acknowledgment
```text

## 12.5 ESP32 Arduino Firmware Sketch (Abbreviated)

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#define ALARM_PIN 26
#define ALARM_DURATION_MS 30000

WiFiClient espClient;
PubSubClient client(espClient);

void callback(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  if (topicStr == "aquaguard/alert") {
    digitalWrite(ALARM_PIN, HIGH);
    delay(ALARM_DURATION_MS);
    digitalWrite(ALARM_PIN, LOW);
  } else if (topicStr == "aquaguard/alert/reset") {
    digitalWrite(ALARM_PIN, LOW);
  }
}

void setup() {
  pinMode(ALARM_PIN, OUTPUT);
  WiFi.begin(SSID, PASSWORD);
  client.setServer(MQTT_BROKER_IP, 1883);
  client.setCallback(callback);
  client.connect("ESP32_AquaGuard");
  client.subscribe("aquaguard/alert");
  client.subscribe("aquaguard/alert/reset");
}

void loop() {
  client.loop();
  // Heartbeat publish every 30s
}
```text

---

# 13. Real-Time Dashboard Architecture

## 13.1 Frontend Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| UI Framework | React.js (functional components + hooks) | Component-based, reactive UI |
| Real-time updates | WebSocket API / Socket.IO client | Live alert push from backend |
| HTTP client | Axios | REST API requests |
| Styling | Tailwind CSS | Rapid, responsive layout |
| Charts / Analytics | Recharts | Incident trend visualization |
| Video streaming | MJPEG or HLS via `<video>` tag | Live camera feed in dashboard |
| State management | React Context + useReducer | Global alert and camera state |

## 13.2 Dashboard Panels

**1. Live Camera Monitor Panel:** Displays MJPEG or HLS stream thumbnails for all registered camera zones. Active zones show a green status indicator; disconnected zones show red. Each camera tile is clickable to expand to full view.

**2. Active Alert Panel:** A high-visibility panel (red background, prominent placement) that renders whenever an unacknowledged alert exists. Shows: camera zone name, detection time, confidence score, and a frame snapshot. Includes an "Acknowledge" button that calls `POST /alerts/{id}/acknowledge`. Triggers an audible browser notification sound.

**3. Detection Feed (Live Log):** A real-time scrolling list of all incoming WebSocket detection events, including non-alert frames above a display threshold (e.g., confidence > 0.4). Allows lifeguards to monitor system activity continuously.

**4. Incident History Panel:** Paginated table of all past confirmed alerts, drawn from `GET /alerts`. Supports filtering by date range, zone, and acknowledgment status. Each row links to the associated frame snapshot.

**5. Analytics / Reports Panel:** Time-series chart (Recharts `LineChart`) showing detection frequency over time, grouped by zone. Bar chart showing alert counts per zone per week. Export to CSV button calling `GET /reports/summary`.

**6. System Status Panel:** Shows the operational status of all system components — camera connections, MQTT broker connectivity, ESP32 heartbeat timestamp, Flask API health.

## 13.3 WebSocket Event Handling

```javascript
// React custom hook — useAlertSocket.js
import { useEffect, useCallback } from 'react';
import io from 'socket.io-client';

export function useAlertSocket(onAlertReceived) {
  useEffect(() => {
    const socket = io('http://localhost:5000', {
      auth: { token: localStorage.getItem('jwt_token') }
    });

    socket.on('alert_event', (payload) => {
      // Payload: { alert_id, zone_name, confidence_score, alerted_at, snapshot_url }
      onAlertReceived(payload);
      playAlertSound();
      showBrowserNotification(payload);
    });

    socket.on('camera_status', (payload) => {
      updateCameraStatus(payload.zone_id, payload.is_active);
    });

    return () => socket.disconnect();
  }, [onAlertReceived]);
}
```text

---

# 14. Hardware Architecture

## 14.1 Hardware Component Overview

| Component | Specification | Role |
|---|---|---|
| IP/CCTV Camera | Minimum 720p (1280×720) @ 15–30 FPS, RTSP output | Captures live pool video for the CV pipeline |
| Detection Server (Edge) | Lenovo LOQ 15IAX9E — Intel Core i5-12450HX, RTX 2050 4GB GDDR6, 8GB DDR5, 512GB NVMe | Runs YOLOv11, MediaPipe, Flask, MQTT broker |
| ESP32 Microcontroller | ESP32-WROOM-32, Dual-core LX6 @ 240 MHz, Wi-Fi 802.11 b/g/n, 4MB Flash | MQTT subscriber, GPIO actuator |
| Buzzer / Alarm Module | Active buzzer or relay-controlled siren, 5V, GPIO-triggered | Physical audible alert |
| Network Router | Wi-Fi 802.11 b/g/n, LAN switch | Connects all components on local LAN |

## 14.2 Hardware Architecture Diagram

```mermaid
graph TB
    subgraph Pool["Aquatic Facility — Physical Installation"]
        CAM1["📷 IP Camera 1\n720p+ RTSP\nPool East Zone"]
        CAM2["📷 IP Camera 2\n720p+ RTSP\nPool West Zone"]
        ROUTER["🌐 Wi-Fi Router\n802.11 b/g/n\nLocal LAN / MQTT"]
        ESP32["🔌 ESP32\nWROOM-32\nMQTT Subscriber"]
        ALARM["🔔 Alarm\nBuzzer / Siren\nGPIO-triggered"]
    end

    subgraph Server["Edge Detection Server\nLenovo LOQ 15IAX9E"]
        GPU["NVIDIA RTX 2050\n4GB GDDR6 CUDA\nYOLOv11 Inference"]
        CPU["Intel i5-12450HX\n8GB DDR5\nMediaPipe + Flask"]
        MQTT_B["Mosquitto\nMQTT Broker\nport 1883"]
        FLASK_S["Flask API\nWebSocket Server\nport 5000"]
        DB_S["SQLite / MySQL\nIncident DB"]
    end

    subgraph Dashboard["Monitoring Station"]
        BROWSER["💻 Web Browser\nReact Dashboard\nLifeguard Monitor"]
    end

    CAM1 -->|RTSP stream| ROUTER
    CAM2 -->|RTSP stream| ROUTER
    ROUTER -->|RTSP forward| CPU
    CPU --> GPU
    GPU -->|Detections| CPU
    CPU --> MQTT_B
    CPU --> FLASK_S
    FLASK_S --> DB_S
    MQTT_B -->|Wi-Fi MQTT| ROUTER
    ROUTER -->|MQTT message| ESP32
    ESP32 -->|GPIO HIGH| ALARM
    FLASK_S -->|WebSocket| ROUTER
    ROUTER -->|WebSocket| BROWSER
    BROWSER -->|HTTP REST| FLASK_S
```text

## 14.3 Wiring Notes for ESP32 Alarm Circuit

```text
ESP32 GPIO 26  →  IN pin of 5V Relay Module
3.3V           →  VCC of Relay Module
GND            →  GND of Relay Module
Relay NO pin   →  Positive terminal of Buzzer/Siren
Buzzer GND     →  GND
5V power supply → Buzzer VCC (via relay switch)
```text

For facilities requiring louder alarms, the relay module can switch a 220V siren via its mains-capable contacts. Standard ESP32 GPIO cannot drive a siren directly — the relay is mandatory for mains-powered alarm systems.

---

# 15. Deployment Architecture

## 15.1 Deployment Overview

AquaGuard version 1.0 is designed for **local edge deployment** at the aquatic facility. All processing occurs on the on-site detection server (Lenovo LOQ). There is no cloud dependency in the base configuration, which ensures the system remains functional even without internet access — a critical constraint for many Philippine provincial facilities with unreliable connectivity.

The following services run on the edge server:

| Service | Port | Description |
|---|---|---|
| Flask REST API + WebSocket | 5000 | Backend for dashboard and event logging |
| Mosquitto MQTT Broker | 1883 | IoT message broker for ESP32 |
| React Dashboard (dev) | 3000 | Frontend development server |
| React Dashboard (prod) | 80 | Served via Nginx |
| YOLOv11 Detection Engine | Internal | Python process, no external port |

## 15.2 Docker Deployment (Recommended)

Docker Compose is recommended to containerize the Flask API, MQTT broker, and database services for consistent deployment and easy updates.

```yaml
# docker-compose.yml — AquaGuard Edge Deployment

version: "3.9"

services:

  aquaguard-detection:
    build: ./detection_engine
    runtime: nvidia         # CUDA support for RTX 2050
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - MQTT_BROKER=mosquitto
      - FLASK_API_URL=http://flask-api:5000
    volumes:
      - ./models:/app/models
      - ./snapshots:/app/snapshots
    depends_on:
      - mosquitto
      - flask-api
    restart: unless-stopped

  flask-api:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=mysql://aquaguard:password@mysql-db:3306/aquaguard
      - JWT_SECRET_KEY=your-secret-key
      - MQTT_BROKER=mosquitto
    depends_on:
      - mysql-db
      - mosquitto
    restart: unless-stopped

  mosquitto:
    image: eclipse-mosquitto:2.0
    ports:
      - "1883:1883"
      - "9001:9001"    # WebSocket for browser MQTT (optional)
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
    restart: unless-stopped

  mysql-db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=rootpassword
      - MYSQL_DATABASE=aquaguard
      - MYSQL_USER=aquaguard
      - MYSQL_PASSWORD=password
    volumes:
      - aquaguard_db_data:/var/lib/mysql
    restart: unless-stopped

  react-dashboard:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - flask-api
    restart: unless-stopped

volumes:
  aquaguard_db_data:
```text

## 15.3 Deployment Diagram

```mermaid
graph TB
    subgraph EdgeServer["Edge Server — Lenovo LOQ 15IAX9E"]
        subgraph Docker["Docker Compose Environment"]
            DETECT["Container: aquaguard-detection\nPython YOLOv11 + MediaPipe\n(CUDA runtime)"]
            FLASK["Container: flask-api\nFlask + Flask-SocketIO\nport 5000"]
            MQTT["Container: mosquitto\nMQTT Broker\nport 1883"]
            DB["Container: mysql-db\nMySQL 8.0\nport 3306"]
            REACT["Container: react-dashboard\nNginx serving React build\nport 80"]
        end
    end

    CAM["IP Camera(s)\nRTSP"] -->|"RTSP stream"| DETECT
    DETECT -->|"MQTT publish"| MQTT
    DETECT -->|"POST /api/events"| FLASK
    FLASK -->|"SQL queries"| DB
    MQTT -->|"Wi-Fi MQTT"| ESP32["ESP32 Alarm"]
    FLASK -->|"WebSocket"| BROWSER["Lifeguard\nBrowser"]
    REACT -->|"Served to"| BROWSER
```text

---

# 16. Scalability Design

## 16.1 Scaling Within a Single Facility

AquaGuard's base architecture is horizontally scalable at the camera level within a single facility. Each additional camera is registered in the `camera_zones` table and assigned a new processing thread in the detection engine. The confidence buffer hash map and MQTT topic structure (`aquaguard/camera/{zone_id}/status`) support arbitrary zone counts.

**Practical single-facility limits with RTX 2050:**

- YOLOv11s inference at ~21–25 ms per frame per camera stream.
- With 4GB GDDR6 VRAM (~2.0–2.2 GB used by the model), batch inference of 1–2 frames simultaneously is feasible.
- Estimated maximum simultaneous cameras at 15 FPS per camera: **2–3 cameras** on a single RTX 2050 before inference latency exceeds the 3-second alert budget.

For larger facilities requiring more cameras, the detection engine can be upgraded to a higher-VRAM GPU (e.g., RTX 4070 Ti with 12GB VRAM) or split across multiple edge servers.

## 16.2 Scaling to Multiple Facilities

For multi-facility deployments (e.g., a resort chain with 5 pools across 3 locations), AquaGuard can be extended with a **central cloud management layer**:

```text
[Facility A Edge Server] ─── VPN tunnel ──→
[Facility B Edge Server] ─── VPN tunnel ──→  [Cloud Dashboard Server]
[Facility C Edge Server] ─── VPN tunnel ──→       (Multi-facility React UI
                                                    + Aggregated MySQL DB)
```text

Each facility edge server retains its full local processing and alarm capability. The cloud layer receives alert events via secure MQTT-over-TLS forwarding or REST API calls and provides a centralized view across all facilities.

## 16.3 Edge AI vs. Cloud AI

| Dimension | Edge AI (Current) | Cloud AI (Future) |
|---|---|---|
| Latency | ~21–25ms inference | ~100–500ms round-trip |
| Internet dependency | None | Required |
| Cost | One-time hardware | Ongoing API/compute costs |
| Privacy | Frames never leave site | Frames uploaded to cloud |
| Scalability | Limited by local GPU | Virtually unlimited |
| Recommended for | Small-medium facilities | Large chains, remote monitoring |

For AquaGuard v1.0, edge AI is the correct choice given the target market of small Philippine facilities. Cloud AI expansion is a Phase 2 enhancement.

---

# 17. Security Architecture

## 17.1 Dashboard Authentication

All Flask API endpoints (except `POST /auth/login`) require a valid JWT access token. Tokens are issued on successful login with a 60-minute expiration. Refresh tokens with 7-day expiration are provided for persistent sessions. Role-based access control (RBAC) distinguishes between `lifeguard` (view-only + acknowledge alerts) and `admin` (full configuration, camera management, user management) roles.

```python
# Flask-JWT-Extended role decorator
@app.route('/api/cameras', methods=['POST'])
@jwt_required()
@role_required('admin')
def add_camera():
    ...
```text

## 17.2 Encrypted Video Streams

Camera RTSP streams should be configured with RTSP over TLS (RTSPS) where supported by the camera hardware. For cameras not supporting RTSPS, RTSP streams are isolated to the internal LAN VLAN and are not exposed to any external network interface. The React dashboard displays video via a Flask-proxied MJPEG endpoint rather than exposing camera IPs directly to browser clients.

## 17.3 Secure MQTT

The Mosquitto broker is configured with:

- Username/password authentication for all publishers and subscribers.
- TLS/SSL encryption on port 8883 for all MQTT traffic.
- ACL (Access Control List) rules restricting ESP32 clients to subscribe-only on `aquaguard/alert` and publish-only on `aquaguard/device/status`.

```text
# mosquitto.conf security settings
listener 8883
cafile /etc/mosquitto/certs/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile /etc/mosquitto/certs/server.key
require_certificate false
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl
```text

## 17.4 Network Isolation

The detection server, cameras, ESP32 devices, and dashboard client are deployed on an isolated LAN VLAN separated from the facility's general internet-facing Wi-Fi. The MQTT broker and Flask API are bound to LAN IP addresses only, not exposed to external networks. A firewall rule blocks all inbound connections to port 1883 and 5000 from non-LAN addresses.

## 17.5 Data Protection

- Frame snapshots stored on disk are named with UUID-based filenames (not sequential integers) to prevent enumeration attacks.
- Database passwords are stored in Docker environment variables / `.env` files, never hardcoded in source.
- The `.env` file is excluded from version control via `.gitignore`.
- JWT secret keys are generated with `secrets.token_hex(64)` and stored in environment variables.

---

# 18. Performance Optimization

## 18.1 GPU Acceleration (CUDA)

The RTX 2050 (4GB GDDR6) is the primary performance enabler. YOLOv11 inference is executed on the CUDA device:

```python
model = YOLO("aquaguard_yolov11s.pt")
model.to("cuda")  # Moves model to GPU
results = model(frame, device="cuda")
```text

CUDA reduces inference time from ~400ms (CPU for YOLOv11s) to ~21–25ms per frame — a ~16–19× speedup that is essential for real-time operation.

## 18.2 Frame Skipping

Not every frame needs to be processed through the full YOLOv11 + MediaPipe pipeline. A configurable `PROCESS_EVERY_N_FRAMES` parameter allows the system to:

- Process every frame for YOLOv11 (GPU-accelerated, ~21–25ms).
- Run MediaPipe Pose only on every 2nd frame per tracked person (since pose rarely changes drastically between frames at 30 FPS).

This reduces MediaPipe load by ~50% without meaningfully degrading drowning detection accuracy.

## 18.3 YOLOv11 Tracking (ByteTrack)

YOLOv11's built-in `model.track(persist=True)` uses ByteTrack for multi-object tracking. Once a person is detected and assigned a track ID, subsequent frames use the existing bounding box prediction as a search region, avoiding a full-image re-detection scan per person. This reduces unnecessary inference overhead in frames where swimmers are already tracked.

## 18.4 Batch Inference

For multi-camera deployments, frames from different cameras can be batched into a single YOLOv11 inference call:

```python
# Batch inference across 2 cameras
frames_batch = [frame_cam1, frame_cam2]
results = model(frames_batch, device="cuda")  # Single GPU call
```text

This improves GPU utilization and reduces per-camera overhead when multiple streams are active simultaneously.

## 18.5 Asynchronous Alert Dispatch

Alert dispatch (MQTT publish + WebSocket emit + HTTP POST) is executed asynchronously using Python `asyncio` or `threading.Thread` to prevent the alert dispatch from blocking the main detection loop:

```python
import threading
def dispatch_alert(payload):
    threading.Thread(target=_send_mqtt, args=(payload,), daemon=True).start()
    threading.Thread(target=_send_websocket, args=(payload,), daemon=True).start()
    threading.Thread(target=_post_to_api, args=(payload,), daemon=True).start()
```text

---

# 19. Fault Tolerance

## 19.1 Camera Disconnection

**Failure scenario:** RTSP stream drops due to camera power loss or network interruption.

**Handling:**

- OpenCV `VideoCapture.read()` returns `ret=False` on stream failure.
- The camera capture thread detects consecutive `ret=False` returns (threshold: 5 consecutive failures) and enters a reconnect loop.
- Reconnect attempts use exponential backoff: 1s → 2s → 4s → 8s → 30s max interval.
- The camera's status is updated to `inactive` in the database and a `camera_status` WebSocket event is emitted to the dashboard, displaying a visual warning.
- The MQTT topic `aquaguard/camera/{zone_id}/status` publishes a `disconnected` event.

## 19.2 Network Failure (LAN Outage)

**Failure scenario:** Local LAN router fails, breaking MQTT and WebSocket connectivity.

**Handling:**

- The ESP32 MQTT client (`PubSubClient`) has a built-in reconnect loop and will automatically reconnect when the broker becomes available again.
- The MQTT broker (Mosquitto) caches QoS 1 messages for persistent sessions, so alerts generated during a brief outage are delivered once connectivity is restored.
- The detection engine continues processing frames locally, buffering alert payloads in an in-memory queue. On reconnection, queued payloads are dispatched in order.
- The React dashboard displays a "Connection Lost" banner and polls for reconnection.

## 19.3 ESP32 Offline

**Failure scenario:** ESP32 loses power or Wi-Fi connectivity.

**Handling:**

- ESP32 heartbeat (`aquaguard/device/status`) is expected every 30 seconds. If the backend does not receive a heartbeat for 90 seconds, the dashboard displays an "Alarm Device Offline" warning.
- The detection engine continues operating and logging events. Alerts that cannot reach the ESP32 are still logged and pushed to the dashboard — lifeguards can manually respond.
- When the ESP32 reconnects, it re-subscribes to `aquaguard/alert`. Due to QoS 1, any pending alerts that were published during the offline period will be delivered.

## 19.4 False Alarm Suppression

**Failure scenario:** CV model generates a false positive (e.g., a child standing vertically in shallow water).

**Handling:**

- The rolling window filter (N=15, T=0.75, K=10) is the primary suppression mechanism. A single or brief false positive is absorbed by the deque buffer without triggering an alert.
- Lifeguards can acknowledge false alerts via the dashboard, which marks them as `false_positive` in the database. These records are preserved for model retraining data collection.
- The confidence threshold parameters (N, T, K) are configurable without code changes, allowing on-site tuning based on facility-specific false positive rates.

## 19.5 Detection Engine Crash

**Failure scenario:** Python detection process crashes due to exception.

**Handling:**

- The detection engine is managed by a `supervisord` process manager (or Docker `restart: unless-stopped` policy), which automatically restarts it within seconds of a crash.
- A `system_logs` entry is written by the exception handler before the crash (if the exception is catchable).
- The dashboard receives a `system_status` WebSocket event indicating the detection engine is offline, alerting staff to the disruption.

---

# 20. Development Roadmap

## Phase 1 — Computer Vision Model Setup (Weeks 1–3)

- Set up Python 3.11 development environment with CUDA, PyTorch, Ultralytics YOLOv11.
- Download and preprocess the Roboflow Swimming and Drowning Detection dataset (7,295 images, 3 classes, CC BY 4.0).
- Fine-tune YOLOv11s on the dataset — model already trained on Kaggle; transfer `.pt` weights file to the `models/` folder on the development machine.
- Validate model mAP on the held-out test split. Target: match or exceed 90.1% mAP baseline.
- Integrate MediaPipe Pose alongside YOLOv11 in a single Python inference pipeline.
- Implement and unit test the Drowning Behavior Analyzer rule set.
- Implement the False Positive Filter deque-based rolling window algorithm.
- Test the full CV pipeline on recorded pool video samples.

**Deliverable:** Working Python CV pipeline processing video file input, outputting drowning confidence scores and bounding box overlays.

## Phase 2 — IoT Hardware Integration (Weeks 3–5)

- Set up ESP32-WROOM-32 development environment (Arduino IDE or MicroPython).
- Wire ESP32 to relay module and buzzer/alarm according to the GPIO circuit diagram.
- Install and configure Eclipse Mosquitto MQTT broker on the edge server.
- Implement ESP32 firmware: Wi-Fi connect, MQTT subscribe (`aquaguard/alert`), GPIO alarm actuation.
- Integrate `paho-mqtt` Python client in the Alert Decision Engine.
- Test end-to-end MQTT flow: Python publisher → Mosquitto broker → ESP32 subscriber → physical alarm activation.
- Implement heartbeat monitoring and ESP32 offline detection.

**Deliverable:** Physical alarm triggered within 200ms of MQTT publish from Python backend.

## Phase 3 — Web Dashboard Development (Weeks 4–7)

- Initialize React.js project with Tailwind CSS and Axios.
- Implement login page and JWT authentication flow.
- Build camera monitoring panel with MJPEG stream display.
- Build real-time alert panel with WebSocket integration (Flask-SocketIO client).
- Build incident history table with filtering and pagination.
- Build analytics charts (Recharts) for detection frequency visualization.
- Build system status panel showing component health.
- Implement alert acknowledgment flow.

**Deliverable:** Functional React dashboard with live WebSocket alerts and REST data display.

## Phase 4 — Full System Integration (Weeks 7–9)

- Deploy all services together using Docker Compose.
- Connect live IP camera RTSP stream to the detection engine.
- End-to-end integration test: Camera → CV → MQTT → ESP32 Alarm → Dashboard Alert → Database Log.
- Validate detection-to-alert latency meets the ≤3 second target.
- Tune confidence threshold parameters (N, T, K) on live pool video to minimize false positives.
- Integrate Flask API fully with React dashboard (all endpoints connected).

**Deliverable:** Integrated system passing end-to-end latency and functional integration tests.

## Phase 5 — Testing, Validation, and Documentation (Weeks 10–14)

- Unit testing: all Python modules, Flask API endpoints, React components.
- Model validation: mAP evaluation on held-out test set; confusion matrix analysis.
- Integration testing: full system test against simulated drowning scenarios (video recordings).
- Field testing: controlled demonstration in a real or simulated pool environment.
- Performance testing: measure detection latency under 1, 2, and 3 simultaneous camera streams.
- Security testing: JWT authentication, MQTT ACL, input validation.
- Documentation: finalize this system design document, user manual for lifeguard dashboard operation, and hardware setup guide.
- Prepare materials for final thesis defense.

**Deliverable:** Validated system with documented test results, complete technical documentation, and defense-ready presentation.

---

# 21. Testing Strategy

## 21.1 Unit Testing

Each module is tested independently using `pytest` (Python) and `Jest` (React):

| Module | Test Cases |
|---|---|
| YOLOv11 inference wrapper | Valid frame input, empty frame, oversized frame, CUDA device assignment |
| MediaPipe Pose wrapper | Valid ROI, empty ROI (no person), low-visibility landmark handling |
| Drowning Behavior Analyzer | Each of 5 indicator rules tested individually with mock landmark data |
| False Positive Filter | Window not full (suppress), mean < T (suppress), mean > T but K < 10 (suppress), confirmed alert (pass) |
| Alert Decision Engine | MQTT publish called, WebSocket emit called, Flask POST called |
| Flask API endpoints | All endpoints tested with valid/invalid JWT, valid/invalid payloads |
| React components | Alert panel render on WebSocket event, acknowledge button handler |

## 21.2 Model Validation

YOLOv11 fine-tuned model is evaluated on a held-out test split (20% of the 7,295-image dataset):

- **Primary metric:** mAP@0.5 — target ≥ 90.1% (matching the ETASR Journal YOLOv8 baseline).
- **Per-class metrics:** Precision, Recall, and F1 score for each class (drowning / swimming / person_out_of_water).
- **Confusion matrix:** Analyzed specifically for drowning vs. swimming misclassification, which is the highest-risk error type (false negative — missed drowning).
- **Threshold sweep:** Precision-recall curve generated to select optimal confidence threshold for deployment.

## 21.3 Integration Testing

End-to-end integration tests validate the full data flow using pre-recorded pool video as input:

- **Test Scenario A — True Positive:** Video of a simulated drowning posture. Expected: Alert dispatched within 3 seconds, MQTT received by ESP32, dashboard alert rendered, event logged to DB.
- **Test Scenario B — True Negative:** Video of normal swimming activity. Expected: No alert dispatched across 60 seconds of continuous monitoring.
- **Test Scenario C — False Positive Suppression:** Video of a swimmer pushing off the wall (brief vertical posture). Expected: Confidence spike recorded in deque but rolling mean does not exceed T within the window — no alert.
- **Test Scenario D — Multi-Camera:** Two simultaneous video streams processed concurrently. Expected: Correct zone attribution for all events, no cross-zone alert contamination.
- **Test Scenario E — ESP32 Offline:** Alert generated while ESP32 is disconnected. Expected: Dashboard alert still fired, event logged, reconnect triggers queued alert delivery.

## 21.4 Field Testing

A controlled field test is conducted at an accessible pool or aquatic facility:

- One camera installed above the pool at the recommended overhead angle.
- Volunteer swimmers perform normal swimming, diving, pushing off walls, and simulated distress postures.
- Detection rate and false positive rate recorded over a 30-minute session.
- Physical alarm activation timing measured with a stopwatch from the moment a simulated distress posture begins.
- Dashboard usability evaluation with a non-technical staff member operating the alert acknowledgment workflow.

---

# 22. Future Improvements

## 22.1 Thermal Camera Integration

Standard optical cameras perform poorly in low-light conditions (night operations, indoor facilities with poor lighting). Thermal / infrared cameras detect the heat signature of the human body independent of lighting conditions. A future version of AquaGuard could integrate a thermal camera feed as a secondary input, with a modified YOLOv11 model trained on thermal image data, enabling 24-hour operation including night swimming periods.

## 22.2 Edge TPU Acceleration

For deployments where a full GPU laptop is not available (e.g., budget-constrained resort pools), AquaGuard could be ported to run on a **Google Coral Edge TPU** (USB Accelerator). A nano or quantized variant of the YOLOv11 model can be compiled to TensorFlow Lite for the Edge TPU, achieving high FPS inference at 2W power consumption — enabling deployment on a Raspberry Pi 4 with Edge TPU, reducing hardware cost to under PHP 5,000.

## 22.3 Mobile App Alerts

The current system delivers alerts exclusively to the web dashboard. A future enhancement would add a **mobile companion app** (React Native or Flutter) that receives push notifications via Firebase Cloud Messaging (FCM) when an alert is triggered, enabling off-site facility managers and emergency responders to be notified even when not at the dashboard. The existing Flask API alert endpoint can be extended to POST to FCM with minimal modification.

## 22.4 AI Behavioral Prediction (Pre-Drowning Detection)

The current system detects active drowning postures. A more advanced future iteration would use **LSTM (Long Short-Term Memory) time-series modeling** on the MediaPipe landmark sequences to predict pre-drowning distress behavior — detecting the 15–30 second period before a full drowning event when a swimmer begins struggling but has not yet submerged. This would further reduce response time and allow preventive intervention rather than reactive rescue.

## 22.5 Underwater Camera Support

Pool cameras mounted above the waterline have limited detection capability when swimmers are submerged. Underwater-rated IP cameras (IP68) mounted on pool walls could provide additional pose tracking angles, dramatically improving detection accuracy for fully submerged drowning events where the overhead camera loses landmark visibility.

## 22.6 Cloud-Based Multi-Facility Dashboard

As described in the Scalability section, a cloud-hosted central dashboard using AWS, Azure, or a local Philippine cloud provider (e.g., PLDT Enterprise Cloud) would enable a resort chain or municipality to monitor all facilities from a single interface, with centralized incident reporting and cross-facility analytics.

## 22.7 Automated Incident Report Generation (AI Narrative)

Using a language model API (e.g., Claude or Gemini), the system could automatically generate a natural-language incident report from the structured database record of each alert: summarizing the time, camera zone, detection confidence, response time, and acknowledging lifeguard — producing a ready-to-submit incident log for facility management and regulatory compliance.

---

_AquaGuard — IoT-Based Drowning Detection and Real-Time Alert System_  
_Mabini Colleges, Inc. | College of Computer Studies | BSCS — Software Engineering_  
_Academic Year 2025–2026 | Defense Date: March 12, 2026_

---

> **Document prepared by:** Joshua Gutierrez (System Designer / Architect) with contributions from the full AquaGuard development team.  
> **Standards Compliance:** ISO/IEC 12207 (Software Life Cycle Processes), ISO/IEC 25010 (System and Software Quality Models), IEEE 29148 (Requirements Engineering), IEEE 1016 (Software Design Descriptions).
