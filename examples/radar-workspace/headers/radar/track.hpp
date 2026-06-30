#pragma once
#include "../common/geometry.hpp"
#include <cstdint>

namespace demo::radar {

#pragma pack(push, 4)
struct RadarTrack {
  std::uint32_t trackId;
  demo::common::Vec3 position;
  demo::common::Vec3 velocity;
  demo::common::CoordinateFrame frame;
  float confidence;
  std::uint16_t history[8];
};
  struct RadarTrack2 {
    std::uint32_t trackId;
    demo::common::Vec3 position;
    demo::common::Vec3 velocity;
    demo::common::CoordinateFrame frame;
    float confidence;
    std::uint16_t history[8];
};
#pragma pack(pop)

}  // namespace demo::radar

