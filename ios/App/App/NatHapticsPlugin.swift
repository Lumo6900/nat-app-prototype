import Capacitor
import CoreHaptics
import AudioToolbox

@objc(NatHapticsPlugin)
public class NatHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NatHapticsPlugin"
    public let jsName = "NatHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var engine: CHHapticEngine?
    private var player: CHHapticPatternPlayer?
    private var refreshTimer: Timer?
    private var isRunning = false

    @objc public func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.startContinuousVibration()
            call.resolve()
        }
    }

    @objc public func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopContinuousVibration()
            call.resolve()
        }
    }

    private func startContinuousVibration() {
        guard !isRunning else { return }
        isRunning = true
        startCoreHapticsPattern()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 24.0, repeats: true) { [weak self] _ in
            guard let self = self, self.isRunning else { return }
            self.startCoreHapticsPattern()
        }
    }

    private func startCoreHapticsPattern() {
        if CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            do {
                if engine == nil {
                    engine = try CHHapticEngine()
                    engine?.resetHandler = { [weak self] in
                        DispatchQueue.main.async {
                            guard let self = self, self.isRunning else { return }
                            self.startCoreHapticsPattern()
                        }
                    }
                    engine?.stoppedHandler = { [weak self] _ in
                        DispatchQueue.main.async {
                            guard let self = self, self.isRunning else { return }
                            self.startCoreHapticsPattern()
                        }
                    }
                }

                try engine?.start()

                let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0)
                let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 1.0)
                let event = CHHapticEvent(
                    eventType: .hapticContinuous,
                    parameters: [intensity, sharpness],
                    relativeTime: 0,
                    duration: 30.0
                )
                let pattern = try CHHapticPattern(events: [event], parameters: [])
                player = try engine?.makePlayer(with: pattern)
                try player?.start(atTime: 0)
            } catch {
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            }
        } else {
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
        }
    }

    private func stopContinuousVibration() {
        isRunning = false
        refreshTimer?.invalidate()
        refreshTimer = nil
        do { try player?.stop(atTime: 0) } catch { }
        player = nil
        engine?.stop(completionHandler: nil)
        engine = nil
    }
}
