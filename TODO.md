# Unreal Helper TODO

## Roadmap

- [x] Basic Unreal sidebar with build, open editor, project picker, and build script picker
- [ ] Step 1: Project structure parsers
- [ ] Step 2: Build presets
- [ ] Step 3: Unreal build and log parser
- [ ] Step 4: C++ reflection and source summary
- [ ] Step 5: Quick actions for logs, config, and project maintenance

## Step 1: Project Structure Parsers

### `.uproject` parser

- [x] Read the selected `.uproject`
- [x] Parse core metadata
- [x] Show engine association
- [x] Detect whether the project is code-based or blueprint-only
- [x] List declared modules
- [x] List enabled plugins
- [x] List target platforms
- [ ] Add richer descriptor fields such as category, description, company, and enterprise flags when present
- [ ] Add clickable navigation from summary entries to source files

### `*.Build.cs` parser

- [x] Find `Source/**/*.Build.cs`
- [x] Infer module name from file name
- [x] Extract public dependency module names
- [x] Extract private dependency module names
- [x] Show a compact module summary in the sidebar
- [ ] Parse additional build settings such as PCH usage, IWYU, and dynamically loaded modules
- [ ] Add warnings for missing module descriptors or suspicious dependency layout

### `*.Target.cs` parser

- [x] Find `Source/**/*.Target.cs`
- [x] Infer target name from file name
- [x] Extract `TargetType`
- [x] Extract `DefaultBuildSettings`
- [x] Extract `IncludeOrderVersion`
- [x] Extract `ExtraModuleNames`
- [x] Show a compact target summary in the sidebar
- [ ] Add summaries for target platforms, link type, and build environment settings

### Integration

- [x] Refresh parser data when the selected project changes
- [x] Refresh parser data when relevant Unreal files change
- [x] Show parser results directly in the Unreal sidebar
- [ ] Add dedicated commands for opening parsed source files from the sidebar
