#pragma once
#include "../common/time.hpp"
#include <cstdint>

namespace demo::diagnostics {

enum class FaultSeverity : std::uint8_t {
  Info = 0,
  Warning = 1,
  Degraded = 2,
  Critical = 3,
};

enum class FaultDomain : std::uint8_t {
  Sensor = 0,
  Tracking = 1,
  Network = 2,
  Storage = 3,
};

struct FaultCode {
  std::uint16_t domain;
  std::uint16_t code;
};

struct FaultEvent {
  demo::common::Timestamp timestamp;
  FaultCode code;
  FaultSeverity severity;
  FaultDomain domain;
  std::uint8_t active;
  std::uint16_t occurrenceCount;
};

struct FaultSnapshot {
  demo::common::SequenceId sequence;
  std::uint16_t eventCount;
  FaultEvent events[4];
};

}  // namespace demo::diagnostics
