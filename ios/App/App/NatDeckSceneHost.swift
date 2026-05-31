import CoreMotion
import SceneKit
import UIKit

final class NatDeckSceneHost {
    static let shared = NatDeckSceneHost()

    private enum DeckShuffleState {
        case idle
        case shuffling
        case settling
    }

    private var sceneView: SCNView?
    private var scene: SCNScene?
    private var deckNode = SCNNode()
    private struct CardRestPose {
        let position: SCNVector3
        let euler: SCNVector3
    }

    private var cardNodes: [SCNNode] = []
    private var cardRestPoses: [CardRestPose] = []
    private var cutMarker: SCNNode?
    private weak var installedRoot: UIView?
    private var panGesture: UIPanGestureRecognizer?
    private var tapGesture: UITapGestureRecognizer?
    private var shuffleIdleWorkItem: DispatchWorkItem?
    private var displayLink: CADisplayLink?
    private var lastTimestamp: CFTimeInterval = 0
    private var phase: String = "intro"
    private var pulsePower: CGFloat = 0
    private var shuffleState: DeckShuffleState = .idle
    private var isUserActivelyShuffling = false
    private var shuffleIntensity: CGFloat = 0
    private var deckOrder = Array(1...37)
    private var motionManager = CMMotionManager()
    private var shakeStopWorkItem: DispatchWorkItem?
    private var cycleCounter = 0

    private init() {}

    func install(over root: UIView) {
        if let existing = sceneView {
            existing.frame = sceneFrame(in: root)
            root.bringSubviewToFront(existing)
            installGestures(on: root)
            return
        }

        let view = SCNView(frame: sceneFrame(in: root))
        view.backgroundColor = .clear
        view.isOpaque = false
        view.allowsCameraControl = false
        view.isUserInteractionEnabled = true
        view.autoresizingMask = [.flexibleWidth, .flexibleBottomMargin]
        view.rendersContinuously = true
        view.antialiasingMode = .multisampling4X
        view.layer.zPosition = 12

        let newScene = SCNScene()
        view.scene = newScene
        root.addSubview(view)
        root.bringSubviewToFront(view)

        sceneView = view
        scene = newScene
        buildScene(newScene)
        installGestures(on: root)
        startMotionUpdates()
        startDisplayLink()
    }

    func setPhase(_ next: String) {
        phase = next
        cutMarker?.opacity = 0
        if next != "shuffle" && next != "finalShuffle" {
            isUserActivelyShuffling = false
            if shuffleState == .shuffling { settleDeck() }
        }
        animateToPhase(next)
    }

    func pulse() {
        registerShuffleInput(intensity: 0.9)
    }

    func cut(ratio raw: CGFloat) {
        let ratio = max(0.08, min(0.92, raw))
        let x = Float(-1.12 + ratio * 2.24)
        cutMarker?.position.x = x
        cutMarker?.opacity = 1
        cutMarker?.runAction(.sequence([.fadeOpacity(to: 1, duration: 0.08), .fadeOpacity(to: 0, duration: 0.72)]))

        let splitIndex = Int(ratio * CGFloat(cardNodes.count - 1))
        for (index, node) in cardNodes.enumerated() {
            let side: Float = index <= splitIndex ? -1 : 1
            let near = abs(index - splitIndex) < 4
            let move = SCNAction.moveBy(x: CGFloat(side * 0.18), y: near ? 0.052 : 0, z: CGFloat(side * 0.05), duration: 0.18)
            move.timingMode = .easeOut
            let back = SCNAction.moveBy(x: CGFloat(-side * 0.18), y: near ? -0.052 : 0, z: CGFloat(-side * 0.05), duration: 0.38)
            back.timingMode = .easeInEaseOut
            node.runAction(.sequence([move, .wait(duration: 0.1), back]))
        }
    }

    private func sceneFrame(in root: UIView) -> CGRect {
        let width = root.bounds.width
        let height = min(root.bounds.height * 0.46, 430)
        let y = (root.bounds.height - height) * 0.5
        return CGRect(x: 0, y: y, width: width, height: height)
    }

    private func installGestures(on root: UIView) {
        guard installedRoot !== root else { return }
        if let oldPan = panGesture { installedRoot?.removeGestureRecognizer(oldPan) }
        if let oldTap = tapGesture { installedRoot?.removeGestureRecognizer(oldTap) }

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handleNativeShuffleGesture(_:)))
        pan.cancelsTouchesInView = false
        pan.delaysTouchesBegan = false
        pan.delaysTouchesEnded = false
        root.addGestureRecognizer(pan)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleNativeShuffleGesture(_:)))
        tap.cancelsTouchesInView = false
        tap.delaysTouchesBegan = false
        tap.delaysTouchesEnded = false
        root.addGestureRecognizer(tap)

        installedRoot = root
        panGesture = pan
        tapGesture = tap
    }

    @objc private func handleNativeShuffleGesture(_ recognizer: UIGestureRecognizer) {
        guard recognizer.state == .began || recognizer.state == .changed || recognizer.state == .recognized || recognizer.state == .ended || recognizer.state == .cancelled else { return }
        let point = recognizer.location(in: recognizer.view)
        guard isPointNearDeck(point, in: recognizer.view) else {
            if recognizer.state == .ended || recognizer.state == .cancelled { stopShuffleInputWithGrace() }
            return
        }

        if recognizer.state == .ended || recognizer.state == .cancelled {
            stopShuffleInputWithGrace()
            return
        }

        let velocity = (recognizer as? UIPanGestureRecognizer)?.velocity(in: recognizer.view) ?? .zero
        let speed = sqrt((velocity.x * velocity.x) + (velocity.y * velocity.y))
        let intensity = min(1.25, max(0.35, speed / 1400))
        registerShuffleInput(intensity: intensity)
    }

    private func isPointNearDeck(_ point: CGPoint, in view: UIView?) -> Bool {
        guard let view = view else { return true }
        let frame = sceneFrame(in: view).insetBy(dx: -36, dy: -42)
        return frame.contains(point)
    }

    private func registerShuffleInput(intensity: CGFloat) {
        if phase == "intro" { phase = "shuffle" }
        guard phase == "shuffle" || phase == "finalShuffle" else { return }
        isUserActivelyShuffling = true
        shuffleIntensity = max(shuffleIntensity, min(1.4, intensity))
        pulsePower = min(1.35, pulsePower + intensity)
        emitShuffleSpark()
        startShuffleLoopIfNeeded()
        stopShuffleInputWithGrace()
    }

    private func stopShuffleInputWithGrace(delay: TimeInterval = 0.32) {
        shuffleIdleWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.isUserActivelyShuffling = false
        }
        shuffleIdleWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
    }

    private func startShuffleLoopIfNeeded() {
        guard shuffleState == .idle else { return }
        shuffleState = .shuffling
        runShuffleCycle()
    }

    private func runShuffleCycle() {
        guard shuffleState == .shuffling else { return }
        animateOneShuffleCycle { [weak self] in
            guard let self = self else { return }
            self.randomizeLogicalOrderOf37Cards()
            if self.isUserActivelyShuffling {
                self.runShuffleCycle()
            } else {
                self.settleDeck()
            }
        }
    }

    private func animateOneShuffleCycle(completion: @escaping () -> Void) {
        cycleCounter += 1
        let cycle = cycleCounter
        let intensity = max(0.35, min(1.35, shuffleIntensity))
        let duration = max(0.18, 0.34 - TimeInterval(intensity) * 0.08)
        let middleDelay = duration * 0.48

        deckNode.removeAction(forKey: "deckShuffleCycle")
        let deckTilt = SCNAction.sequence([
            .group([
                .rotateBy(x: CGFloat.random(in: -0.035...0.035) * intensity, y: CGFloat.random(in: -0.055...0.055) * intensity, z: CGFloat.random(in: -0.05...0.05) * intensity, duration: middleDelay),
                .move(to: SCNVector3(0, -0.05, 0), duration: middleDelay)
            ]),
            .group([
                .rotateBy(x: CGFloat.random(in: -0.018...0.018) * intensity, y: CGFloat.random(in: -0.025...0.025) * intensity, z: CGFloat.random(in: -0.022...0.022) * intensity, duration: duration - middleDelay),
                .move(to: SCNVector3(0, -0.05, 0), duration: duration - middleDelay)
            ])
        ])
        deckTilt.timingMode = .easeInEaseOut
        deckNode.runAction(deckTilt, forKey: "deckShuffleCycle")

        for (index, node) in cardNodes.enumerated() {
            guard index < cardRestPoses.count else { continue }
            node.removeAction(forKey: "shuffleCycle")
            let rest = cardRestPoses[index]
            let layer = CGFloat(index) / CGFloat(max(1, cardNodes.count - 1))
            let side = CGFloat.random(in: -1...1)
            let forward = CGFloat.random(in: -1...1)
            let lift = CGFloat.random(in: -0.2...1.0)
            let spread = (0.035 + layer * 0.10) * intensity
            let outPosition = SCNVector3(
                rest.position.x + Float(side * spread),
                rest.position.y + Float(lift * 0.035 * intensity),
                rest.position.z + Float(forward * spread * 0.62)
            )
            let outEuler = SCNVector3(
                rest.euler.x + Float(CGFloat.random(in: -0.035...0.035) * intensity),
                rest.euler.y + Float(CGFloat.random(in: -0.055...0.055) * intensity),
                rest.euler.z + Float(CGFloat.random(in: -0.070...0.070) * intensity)
            )
            let moveOut = SCNAction.group([
                .move(to: outPosition, duration: middleDelay),
                .rotateTo(x: CGFloat(outEuler.x), y: CGFloat(outEuler.y), z: CGFloat(outEuler.z), duration: middleDelay, usesShortestUnitArc: true)
            ])
            moveOut.timingMode = .easeOut
            let moveBack = SCNAction.group([
                .move(to: rest.position, duration: duration - middleDelay),
                .rotateTo(x: CGFloat(rest.euler.x), y: CGFloat(rest.euler.y), z: CGFloat(rest.euler.z), duration: duration - middleDelay, usesShortestUnitArc: true)
            ])
            moveBack.timingMode = .easeInEaseOut
            node.runAction(.sequence([moveOut, moveBack]), forKey: "shuffleCycle")
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            guard let self = self, self.cycleCounter == cycle else { return }
            completion()
        }
    }

    private func randomizeLogicalOrderOf37Cards() {
        guard deckOrder.count == 37 else {
            deckOrder = Array(1...37)
            return
        }
        deckOrder.shuffle()
    }

    private func settleDeck() {
        guard shuffleState != .settling else { return }
        shuffleState = .settling
        shuffleIntensity = 0
        pulsePower = 0
        for (index, node) in cardNodes.enumerated() {
            guard index < cardRestPoses.count else { continue }
            node.removeAction(forKey: "shuffleCycle")
            let rest = cardRestPoses[index]
            let action = SCNAction.group([
                .move(to: rest.position, duration: 0.42),
                .rotateTo(x: CGFloat(rest.euler.x), y: CGFloat(rest.euler.y), z: CGFloat(rest.euler.z), duration: 0.42, usesShortestUnitArc: true)
            ])
            action.timingMode = .easeInEaseOut
            node.runAction(action, forKey: "settle")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.46) { [weak self] in
            guard let self = self else { return }
            self.shuffleState = .idle
            if self.phase == "shuffle" { self.setPhase("cut") }
        }
    }

    private func startMotionUpdates() {
        guard motionManager.isAccelerometerAvailable, !motionManager.isAccelerometerActive else { return }
        motionManager.accelerometerUpdateInterval = 1.0 / 30.0
        motionManager.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let self = self, let acceleration = data?.acceleration else { return }
            let magnitude = sqrt((acceleration.x * acceleration.x) + (acceleration.y * acceleration.y) + (acceleration.z * acceleration.z))
            let dynamic = abs(magnitude - 1.0)
            guard dynamic > 0.38 else { return }
            let intensity = min(1.35, max(0.45, dynamic / 0.9))
            self.registerShuffleInput(intensity: intensity)
        }
    }

    private func buildScene(_ scene: SCNScene) {
        scene.background.contents = UIColor.clear

        let camera = SCNCamera()
        camera.fieldOfView = 37
        camera.wantsHDR = true
        camera.wantsExposureAdaptation = true
        let cameraNode = SCNNode()
        cameraNode.camera = camera
        cameraNode.position = SCNVector3(0, 0.55, 6.4)
        cameraNode.eulerAngles = SCNVector3(-0.08, 0, 0)
        scene.rootNode.addChildNode(cameraNode)

        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.intensity = 1400
        ambient.color = UIColor(red: 1, green: 0.86, blue: 0.66, alpha: 1)
        let ambientNode = SCNNode()
        ambientNode.light = ambient
        scene.rootNode.addChildNode(ambientNode)

        let key = SCNLight()
        key.type = .spot
        key.intensity = 2600
        key.spotInnerAngle = 30
        key.spotOuterAngle = 78
        key.castsShadow = false
        key.shadowRadius = 4
        key.shadowMode = .forward
        key.color = UIColor(red: 1, green: 0.78, blue: 0.44, alpha: 1)
        let keyNode = SCNNode()
        keyNode.light = key
        keyNode.position = SCNVector3(-3.2, 4.2, 5.6)
        keyNode.eulerAngles = SCNVector3(-0.75, -0.42, 0)
        scene.rootNode.addChildNode(keyNode)

        let rim = SCNLight()
        rim.type = .omni
        rim.intensity = 1400
        rim.color = UIColor(red: 0.56, green: 0.36, blue: 1, alpha: 1)
        let rimNode = SCNNode()
        rimNode.light = rim
        rimNode.position = SCNVector3(3.1, -1.1, 3.1)
        scene.rootNode.addChildNode(rimNode)

        deckNode = SCNNode()
        deckNode.scale = SCNVector3(0.58, 0.58, 0.58)
        deckNode.position = SCNVector3(0, -0.05, 0)
        deckNode.eulerAngles = SCNVector3(0.28, 0.12, -0.04)
        scene.rootNode.addChildNode(deckNode)

        buildDeck()
        buildCutMarker()
    }

    private func buildDeck() {
        cardNodes.removeAll()
        cardRestPoses.removeAll()
        deckOrder = Array(1...37)
        let count = 37
        for i in 0..<count {
            let box = SCNBox(width: 2.6, height: 0.017, length: 3.62, chamferRadius: 0.045)
            box.widthSegmentCount = 10
            box.lengthSegmentCount = 14
            box.materials = materialsForCard(isTop: i == count - 1)

            let node = SCNNode(geometry: box)
            let y = -0.34 + Float(i) * 0.015
            node.position = SCNVector3(Float(sin(Double(i) * 1.7)) * 0.006, y, Float(cos(Double(i) * 1.31)) * 0.006)
            node.eulerAngles = SCNVector3(0, Float(sin(Double(i) * 0.8)) * 0.003, 0)
            node.castsShadow = false
            cardRestPoses.append(CardRestPose(position: node.position, euler: node.eulerAngles))
            cardNodes.append(node)
            deckNode.addChildNode(node)
        }
    }

    private func materialsForCard(isTop: Bool) -> [SCNMaterial] {
        let side = SCNMaterial()
        side.diffuse.contents = UIColor(red: 0.94, green: 0.86, blue: 0.68, alpha: 1)
        side.emission.contents = UIColor(red: 0.18, green: 0.13, blue: 0.08, alpha: 1)
        side.roughness.contents = 0.62

        let paper = SCNMaterial()
        paper.diffuse.contents = UIColor(red: 1.00, green: 0.94, blue: 0.80, alpha: 1)
        paper.emission.contents = UIColor(red: 0.20, green: 0.15, blue: 0.09, alpha: 1)
        paper.roughness.contents = 0.58

        let back = SCNMaterial()
        back.diffuse.contents = isTop ? makeBackTexture() : UIColor(red: 0.97, green: 0.91, blue: 0.79, alpha: 1)
        back.emission.contents = isTop ? UIColor(red: 0.28, green: 0.16, blue: 0.34, alpha: 1) : UIColor(red: 0.22, green: 0.16, blue: 0.10, alpha: 1)
        back.roughness.contents = 0.34
        back.metalness.contents = isTop ? 0.02 : 0

        // SCNBox material order in practice: front, right, back, left, top, bottom.
        // Keep both broad faces readable so orientation issues never collapse to black.
        return [side, side, side, side, back, back]
    }

    private func makeBackTexture() -> UIImage {
        let size = CGSize(width: 512, height: 768)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let cg = ctx.cgContext
            let colors = [UIColor(red: 0.34, green: 0.18, blue: 0.44, alpha: 1).cgColor,
                          UIColor(red: 0.10, green: 0.07, blue: 0.15, alpha: 1).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            cg.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])

            UIColor(red: 0.84, green: 0.66, blue: 0.31, alpha: 1).setStroke()
            let outer = UIBezierPath(roundedRect: CGRect(x: 32, y: 32, width: size.width - 64, height: size.height - 64), cornerRadius: 38)
            outer.lineWidth = 12
            outer.stroke()
            let inner = UIBezierPath(roundedRect: CGRect(x: 64, y: 64, width: size.width - 128, height: size.height - 128), cornerRadius: 26)
            inner.lineWidth = 3
            inner.stroke()

            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            cg.setShadow(offset: .zero, blur: 18, color: UIColor(red: 0.84, green: 0.66, blue: 0.31, alpha: 0.7).cgColor)
            UIColor(red: 0.90, green: 0.75, blue: 0.42, alpha: 1).setFill()
            for i in 0..<8 {
                cg.saveGState()
                cg.translateBy(x: center.x, y: center.y)
                cg.rotate(by: CGFloat(i) * .pi / 4)
                let p = UIBezierPath()
                p.move(to: CGPoint(x: 0, y: -118))
                p.addLine(to: CGPoint(x: 18, y: -46))
                p.addLine(to: CGPoint(x: 0, y: -62))
                p.addLine(to: CGPoint(x: -18, y: -46))
                p.close()
                p.fill()
                cg.restoreGState()
            }
            let star = NSAttributedString(string: "✦", attributes: [
                .font: UIFont.systemFont(ofSize: 92, weight: .black),
                .foregroundColor: UIColor(red: 0.90, green: 0.75, blue: 0.42, alpha: 1)
            ])
            star.draw(at: CGPoint(x: center.x - 34, y: center.y - 56))
        }
    }

    private func buildCutMarker() {
        let marker = SCNBox(width: 0.03, height: 1.1, length: 3.95, chamferRadius: 0.01)
        let material = SCNMaterial()
        material.diffuse.contents = UIColor(red: 0.95, green: 0.72, blue: 0.28, alpha: 0.95)
        material.emission.contents = UIColor(red: 0.95, green: 0.55, blue: 0.16, alpha: 0.8)
        marker.materials = [material]
        let node = SCNNode(geometry: marker)
        node.position = SCNVector3(0, 0.18, 0)
        node.opacity = 0
        cutMarker = node
        deckNode.addChildNode(node)
    }

    private func animateToPhase(_ next: String) {
        let target: SCNAction
        switch next {
        case "cut":
            target = .group([
                .rotateTo(x: 0.0, y: 0.0, z: 0.0, duration: 0.95, usesShortestUnitArc: true),
                .move(to: SCNVector3(0, -0.03, 0.0), duration: 0.95),
                .scale(to: 0.82, duration: 0.95)
            ])
        case "shuffle", "finalShuffle":
            target = .group([
                .rotateTo(x: 0.28, y: 0.16, z: -0.05, duration: 0.45, usesShortestUnitArc: true),
                .move(to: SCNVector3(0, -0.05, 0), duration: 0.45),
                .scale(to: 0.58, duration: 0.45)
            ])
        default:
            target = .group([
                .rotateTo(x: 0.28, y: 0.12, z: -0.04, duration: 0.45, usesShortestUnitArc: true),
                .move(to: SCNVector3(0, -0.05, 0), duration: 0.45),
                .scale(to: 0.58, duration: 0.45)
            ])
        }
        target.timingMode = .easeInEaseOut
        deckNode.runAction(target)
    }

    private func emitShuffleSpark() {
        guard let scene = scene else { return }
        for _ in 0..<10 {
            let sphere = SCNSphere(radius: 0.018)
            let material = SCNMaterial()
            material.diffuse.contents = UIColor(red: 0.95, green: 0.69, blue: 0.26, alpha: 1)
            material.emission.contents = UIColor(red: 0.95, green: 0.55, blue: 0.18, alpha: 1)
            sphere.materials = [material]
            let node = SCNNode(geometry: sphere)
            node.position = SCNVector3(Float.random(in: -0.8...0.8), Float.random(in: -0.2...0.5), Float.random(in: -1.0...1.0))
            scene.rootNode.addChildNode(node)
            let out = SCNAction.moveBy(x: CGFloat(Float.random(in: -1.0...1.0)), y: CGFloat(Float.random(in: 0.2...0.8)), z: CGFloat(Float.random(in: -0.6...0.6)), duration: 0.72)
            out.timingMode = .easeOut
            node.runAction(.sequence([.group([out, .fadeOut(duration: 0.72)]), .removeFromParentNode()]))
        }
    }

    private func startDisplayLink() {
        displayLink?.invalidate()
        lastTimestamp = 0
        displayLink = CADisplayLink(target: self, selector: #selector(step(_:)))
        displayLink?.add(to: .main, forMode: .common)
    }

    @objc private func step(_ link: CADisplayLink) {
        if lastTimestamp == 0 { lastTimestamp = link.timestamp }
        let dt = min(0.05, link.timestamp - lastTimestamp)
        lastTimestamp = link.timestamp
        pulsePower = max(0, pulsePower - CGFloat(dt) * 0.95)
    }
}
