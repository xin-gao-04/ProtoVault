#pragma once
#include "../common/geometry.hpp"
#include "../common/time.hpp"
#include <cstdint>

namespace demo::radar {

enum class DetectionSource : std::uint8_t {
  PrimaryRadar = 0,
  SecondaryRadar = 1,
  Fused = 2
};

struct RadarDetection {
  demo::common::SequenceId sequence;
  demo::common::Timestamp timestamp;
  demo::common::Pose3D sensorPose;
  demo::common::Vec3 rangeDoppler;
  DetectionSource source;
  float signalToNoise;
};

struct DetectionFrame {
  std::uint32_t frameId;
  demo::common::Timestamp startedAt;
  std::uint16_t detectionCount;
  RadarDetection detections[32];
};

}  // namespace demo::radar
