cmake_minimum_required(VERSION 3.25)
project(ProtoVaultProtocolCore VERSION 0.1.0 LANGUAGES CXX)

if(MSVC AND MSVC_VERSION LESS 1929)
  message(FATAL_ERROR
    "ProtoVault requires Visual Studio 2022 Build Tools (MSVC 19.29 or newer) "
    "for C++20. The selected compiler is MSVC ${MSVC_VERSION}. "
    "Install the Desktop development with C++ workload, remove the build "
    "directory, and configure again with -G \"Visual Studio 17 2022\".")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(protovault-core src/main.cpp)
target_compile_definitions(protovault-core PRIVATE PROTOVAULT_CONTRACT_VERSION="1.0.0")

if(MSVC)
  target_compile_options(protovault-core PRIVATE /W4 /permissive-)
else()
  target_compile_options(protovault-core PRIVATE -Wall -Wextra -Wpedantic)
endif()

enable_testing()
add_test(NAME core-self-test COMMAND protovault-core --self-test)
