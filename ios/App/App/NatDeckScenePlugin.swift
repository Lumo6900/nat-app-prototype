import Capacitor
import UIKit

@objc(NatDeckScenePlugin)
public class NatDeckScenePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NatDeckScenePlugin"
    public let jsName = "NatDeckScene"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPhase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pulse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]

    @objc public func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let root = self.bridge?.viewController?.view {
                NatDeckSceneHost.shared.install(over: root)
            }
            call.resolve()
        }
    }

    @objc public func hide(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc public func setPhase(_ call: CAPPluginCall) {
        let phase = call.getString("phase") ?? "intro"
        DispatchQueue.main.async {
            if let root = self.bridge?.viewController?.view {
                NatDeckSceneHost.shared.install(over: root)
            }
            NatDeckSceneHost.shared.setPhase(phase)
            call.resolve()
        }
    }

    @objc public func pulse(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let root = self.bridge?.viewController?.view {
                NatDeckSceneHost.shared.install(over: root)
            }
            NatDeckSceneHost.shared.pulse()
            call.resolve()
        }
    }

    @objc public func cut(_ call: CAPPluginCall) {
        let ratio = CGFloat(call.getDouble("ratio") ?? 0.5)
        DispatchQueue.main.async {
            if let root = self.bridge?.viewController?.view {
                NatDeckSceneHost.shared.install(over: root)
            }
            NatDeckSceneHost.shared.cut(ratio: ratio)
            call.resolve()
        }
    }
}
