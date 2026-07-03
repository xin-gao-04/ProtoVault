#pragma once
#include "../common/time.hpp"
#include "../diagnostics/faults.hpp"
#include <cstdint>

namespace demo::telemetry {

enum class LinkState : std::uint8_t {
  Offline = 0,
  Starting = 1,
  Online = 2,
  Degraded = 3,
};

struct CpuStatus {
  float loadAverage;
  float temperatureCelsius;
  std::uint32_t uptimeSeconds;
};

struct MemoryStatus {
  std::uint32_t totalBytes;
  std::uint32_t usedBytes;
  std::uint32_t peakBytes;
};

struct NodeStatus {
  demo::common::Timestamp timestamp;
  LinkState link;
  CpuStatus cpu;
  MemoryStatus memory;
  demo::diagnostics::FaultSeverity maxFaultSeverity;
};

}  // namespace demo::telemetry
