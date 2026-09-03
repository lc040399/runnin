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
        Text(Int(value.rounded()).formatted(.number.grouping(.automatic)))
            .monospacedDigit()
    }
}
