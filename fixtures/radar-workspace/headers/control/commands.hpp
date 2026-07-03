#pragma once
#include "../common/geometry.hpp"
#include "../common/time.hpp"
#include <cstdint>

namespace demo::control {

enum class CommandKind : std::uint8_t {
  Reset = 0,
  Calibrate = 1,
  TrackRegion = 2,
  SetMode = 3,
};

enum class CommandPriority : std::uint8_t {
  Low = 0,
  Normal = 1,
  High = 2,
  Emergency = 3,
};

struct RegionOfInterest {
  demo::common::Vec3 center;
  demo::common::Vec3 extent;
  demo::common::CoordinateFrame frame;
};

struct CommandHeader {
  demo::common::SequenceId sequence;
  demo::common::Timestamp issuedAt;
  CommandKind kind;
  CommandPriority priority;
};

struct TrackRegionCommand {
  CommandHeader header;
  RegionOfInterest region;
  std::uint32_t durationMs;
};

}  // namespace demo::control
