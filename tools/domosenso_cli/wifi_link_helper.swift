// Prints the Mac's own Wi-Fi link on one line, for `floorplan survey` (SPEC-044):
//   rssi=-40 noise=-91 channel=69 band=3 if=en0   band is CWChannelBand: 1 = 2.4, 2 = 5, 3 = 6 GHz, 0 unknown
//   off if=en0                                    the interface has no link (`off` alone: no Wi-Fi interface)
// `if` names the interface read, so the survey reads that one's MAC address.
// Without Location permission CoreWLAN still gives signal, noise and channel, but SSID and BSSID are nil,
// so neither is printed. An optional argument names the interface (default: the system's Wi-Fi interface).
import CoreWLAN

let client = CWWiFiClient.shared()
let name = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : nil
let iface = name.flatMap { client.interface(withName: $0) } ?? client.interface()

let suffix = iface?.interfaceName.map { " if=\($0)" } ?? ""
if let i = iface, let ch = i.wlanChannel(), i.rssiValue() != 0 {
    print("rssi=\(i.rssiValue()) noise=\(i.noiseMeasurement()) channel=\(ch.channelNumber) band=\(ch.channelBand.rawValue)\(suffix)")
} else {
    print("off\(suffix)")
}
