// SPDX-License-Identifier: BUSL-1.1

// IOSDebugDetector.swift
// Finance
//
// Debugger detection for iOS (#330).

import Foundation

/// Detects whether a debugger is attached to the running process.
///
/// Uses the sysctl P_TRACED flag which is the standard mechanism
/// for detecting LLDB/GDB attachment on iOS.
enum IOSDebugDetector {

    static func isDebuggerAttached() -> Bool {
        var info = kinfo_proc()
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        var size = MemoryLayout<kinfo_proc>.stride
        let result = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
        if result == 0 {
            return (info.kp_proc.p_flag & P_TRACED) != 0
        }
        return false
    }
}