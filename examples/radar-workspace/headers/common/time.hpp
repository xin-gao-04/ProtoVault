#pragma once
#include <cstdint>

namespace demo::common {

struct Timestamp {
  std::uint64_t seconds;
  std::uint32_t nanoseconds;
};

struct SequenceId {
  std::uint32_t source;
  std::uint32_t counter;
};

enum class QualityLevel : std::uint8_t {
  Invalid = 0,
  Low = 1,
  Medium = 2,
  High = 3
};

}  // namespace demo::common
