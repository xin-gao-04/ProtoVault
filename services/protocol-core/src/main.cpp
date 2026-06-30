#include <iostream>
#include <string_view>

namespace {
constexpr std::string_view contract_version = PROTOVAULT_CONTRACT_VERSION;

int self_test() {
  if (contract_version != "1.0.0") {
    std::cerr << "Contract version mismatch\n";
    return 1;
  }
  std::cout << "ProtoVault protocol core self-test passed\n";
  return 0;
}
}

int main(int argc, char** argv) {
  if (argc == 2 && std::string_view{argv[1]} == "--self-test") return self_test();
  if (argc == 2 && std::string_view{argv[1]} == "--health") {
    std::cout << R"({"status":"ready","contractVersion":")" << contract_version << R"("})" << '\n';
    return 0;
  }
  std::cerr << "Usage: protovault-core --health | --self-test\n";
  return 2;
}

