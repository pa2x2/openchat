-keep class com.margelo.nitro.** { *; }

# expo-task-manager loads it by name to start JS for a background task, and
# expo-modules-core only keeps its constructor, not the class name.
-keep class expo.modules.adapters.react.apploader.RNHeadlessAppLoader { <init>(); }

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
