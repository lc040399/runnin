import SwiftUI

/// Tal der tæller blødt op/ned til sin nye værdi i stedet for at snappe.
/// Animatable gør at SwiftUI interpolerer værdien frame for frame.
struct CountingNumber: View, Animatable {
    var value: Double
    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        // tusindtalsseparator følger appens sprog (da: 6.658 · en: 6,658)
        let loc = Locale(identifier: Lang.shared.erDansk ? "da_DK" : "en_US")
        Text(Int(value.rounded()).formatted(.number.grouping(.automatic).locale(loc)))
            .monospacedDigit()
    }
}

/// Blødt fjeder-tryk på knapper (skalerer let ned mens man holder).
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
