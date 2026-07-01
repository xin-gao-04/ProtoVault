#pragma once
#include "../common/geometry.hpp"
#include "../common/time.hpp"
#include <cstdint>

namespace demo::radar {

enum class TrackState : std::uint8_t {
  Tentative = 0,
  Confirmed = 1,
  Lost = 2,
  Deleted = 3
};

#pragma pack(push, 4)
struct RadarTrack {
  std::uint32_t trackId;
  demo::common::Timestamp timestamp;
  demo::common::Vec3 position;
  demo::common::Vec3 velocity;
  demo::common::CoordinateFrame frame;
  TrackState state;
  float confidence;
  std::uint16_t history[8];
};

struct TrackCluster {
  std::uint32_t clusterId;
  std::uint16_t trackCount;
  std::uint32_t trackIds[16];
  demo::common::QualityLevel quality;
};
#pragma pack(pop)

}  // namespace demo::radar
