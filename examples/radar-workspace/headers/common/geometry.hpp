#pragma once
#include <cstdint>

namespace demo::common {

struct Vec3 {
  double x;
  double y;
  double z;
};

enum class CoordinateFrame : std::uint8_t {
  Unknown = 0,
  ENU = 1,
  ECEF = 2
};

}  // namespace demo::common

