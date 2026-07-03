#pragma once
#include <cstdint>

namespace demo::common {

struct Vec3 {
  double x;
  double y;
  double z;
};

struct Quaternion {
  double w;
  double x;
  double y;
  double z;
};

struct Pose3D {
  Vec3 position;
  Quaternion orientation;
};

enum class CoordinateFrame : std::uint8_t {
  Unknown = 0,
  ENU = 1,
  ECEF = 2,
  SensorBody = 3
};

}  // namespace demo::common
