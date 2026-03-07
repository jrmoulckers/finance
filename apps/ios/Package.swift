// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Finance",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
        .watchOS(.v10),
    ],
    products: [
        .library(name: "FinanceApp", targets: ["FinanceApp"]),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "FinanceApp",
            path: "Finance"
        ),
    ]
)
