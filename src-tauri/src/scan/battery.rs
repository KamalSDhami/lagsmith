//! Battery capacity straight from the battery driver (IOCTL_BATTERY_QUERY_INFORMATION), the same
//! source powercfg uses. Needs no admin. Fallback for PCs where WMI's BatteryStaticData fails
//! ("Generic failure" on this ThinkPad T480, 27 Nov 2026) while powercfg still reports 48.84 Wh design.

use windows::Win32::Devices::DeviceAndDriverInstallation::{
    DIGCF_DEVICEINTERFACE, DIGCF_PRESENT, SP_DEVICE_INTERFACE_DATA, SP_DEVICE_INTERFACE_DETAIL_DATA_W,
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW, SetupDiGetDeviceInterfaceDetailW,
};
use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE};
use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
use windows::Win32::System::IO::DeviceIoControl;
use windows::Win32::System::Power::{
    BATTERY_INFORMATION, BATTERY_QUERY_INFORMATION, BatteryInformation, GUID_DEVICE_BATTERY, IOCTL_BATTERY_QUERY_INFORMATION,
    IOCTL_BATTERY_QUERY_TAG,
};
use windows::core::PCWSTR;

/// (design, full-charge) capacity in mWh, summed over every battery that reports one. None when none do.
pub fn capacity_mwh() -> (Option<u32>, Option<u32>) {
    let (mut design, mut full) = (0u32, 0u32);
    let Ok(set) = (unsafe { SetupDiGetClassDevsW(Some(&GUID_DEVICE_BATTERY), PCWSTR::null(), None, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE) }) else {
        return (None, None);
    };
    for i in 0.. {
        let mut data = SP_DEVICE_INTERFACE_DATA { cbSize: size_of::<SP_DEVICE_INTERFACE_DATA>() as u32, ..Default::default() };
        if unsafe { SetupDiEnumDeviceInterfaces(set, None, &GUID_DEVICE_BATTERY, i, &mut data) }.is_err() {
            break;
        }
        if let Some(info) = query(set, &data) {
            design += info.DesignedCapacity;
            full += info.FullChargedCapacity;
        }
    }
    let _ = unsafe { SetupDiDestroyDeviceInfoList(set) };
    ((design > 0).then_some(design), (full > 0).then_some(full))
}

fn query(set: windows::Win32::Devices::DeviceAndDriverInstallation::HDEVINFO, data: &SP_DEVICE_INTERFACE_DATA) -> Option<BATTERY_INFORMATION> {
    let mut needed = 0u32;
    let _ = unsafe { SetupDiGetDeviceInterfaceDetailW(set, data, None, 0, Some(&mut needed), None) };
    if needed < 8 {
        return None;
    }
    // u32 elements keep the buffer 4-aligned, as the detail struct requires.
    let mut buf = vec![0u32; (needed as usize).div_ceil(4)];
    let detail = buf.as_mut_ptr().cast::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>();
    unsafe { (*detail).cbSize = size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as u32 };
    unsafe { SetupDiGetDeviceInterfaceDetailW(set, data, Some(detail), needed, None, None) }.ok()?;
    let path = unsafe { (&raw const (*detail).DevicePath).cast::<u16>() };
    let h = unsafe { CreateFileW(PCWSTR(path), GENERIC_READ.0 | GENERIC_WRITE.0, FILE_SHARE_READ | FILE_SHARE_WRITE, None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None) }.ok()?;
    let result = (|| {
        let wait = 0u32; // 0 = don't wait for a battery to appear
        let mut tag = 0u32;
        let mut got = 0u32;
        unsafe { DeviceIoControl(h, IOCTL_BATTERY_QUERY_TAG, Some((&raw const wait).cast()), 4, Some((&raw mut tag).cast()), 4, Some(&mut got), None) }.ok()?;
        if tag == 0 {
            return None; // empty slot
        }
        let q = BATTERY_QUERY_INFORMATION { BatteryTag: tag, InformationLevel: BatteryInformation, AtRate: 0 };
        let mut info = BATTERY_INFORMATION::default();
        let size = size_of::<BATTERY_INFORMATION>() as u32;
        unsafe {
            DeviceIoControl(h, IOCTL_BATTERY_QUERY_INFORMATION, Some((&raw const q).cast()), size_of::<BATTERY_QUERY_INFORMATION>() as u32, Some((&raw mut info).cast()), size, Some(&mut got), None)
        }
        .ok()?;
        Some(info)
    })();
    let _ = unsafe { CloseHandle(h) };
    result
}
