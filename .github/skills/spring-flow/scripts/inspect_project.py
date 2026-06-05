#!/usr/bin/env python3
"""Print a read-only Markdown snapshot for Spring Boot + React/Vite projects."""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterable


ROOT = Path.cwd()


def rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def load_json(path: Path) -> dict:
    try:
        return json.loads(read_text(path))
    except json.JSONDecodeError:
        return {}


def find_files(name: str) -> list[Path]:
    ignored_parts = {"target", "node_modules", ".git", "dist", "build", ".idea", ".vscode"}
    return [
        path
        for path in ROOT.rglob(name)
        if not any(part in ignored_parts for part in path.parts)
    ]


def find_spring_boot_package() -> tuple[str, str]:
    for path in sorted((ROOT / "src/main/java").rglob("*.java")):
        text = read_text(path)
        if "@SpringBootApplication" not in text:
            continue
        match = re.search(r"(?m)^\s*package\s+([\w.]+)\s*;", text)
        return (match.group(1) if match else "not declared", rel(path))
    return ("not found", "not found")


def parse_pom(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        tree = ET.parse(path)
    except ET.ParseError:
        return {}

    root = tree.getroot()
    ns = {"m": root.tag.split("}")[0].strip("{")} if "}" in root.tag else {}

    def find_text(xpath: str) -> str:
        value = root.findtext(xpath, namespaces=ns)
        return value.strip() if value else ""

    def prop(name: str) -> str:
        xpath = f"m:properties/m:{name}" if ns else f"properties/{name}"
        value = root.findtext(xpath, namespaces=ns)
        return value.strip() if value else ""

    dep_xpath = "m:dependencies/m:dependency" if ns else "dependencies/dependency"
    deps = []
    for dep in root.findall(dep_xpath, namespaces=ns):
        group = dep.findtext("m:groupId" if ns else "groupId", namespaces=ns) or ""
        artifact = dep.findtext("m:artifactId" if ns else "artifactId", namespaces=ns) or ""
        version = dep.findtext("m:version" if ns else "version", namespaces=ns) or ""
        scope = dep.findtext("m:scope" if ns else "scope", namespaces=ns) or ""
        if group and artifact:
            suffix = f":{version}" if version else ""
            scope_suffix = f" ({scope})" if scope else ""
            deps.append(f"{group}:{artifact}{suffix}{scope_suffix}")

    module_xpath = "m:modules/m:module" if ns else "modules/module"
    modules = [
        (module.text or "").strip()
        for module in root.findall(module_xpath, namespaces=ns)
        if (module.text or "").strip()
    ]

    return {
        "artifact": find_text("m:artifactId" if ns else "artifactId"),
        "spring_boot": find_text("m:parent/m:version" if ns else "parent/version"),
        "java": prop("java.version"),
        "spring_cloud": prop("spring-cloud.version"),
        "spring_cloud_gcp": prop("spring-cloud-gcp.version"),
        "node": prop("node.version"),
        "npm": prop("npm.version"),
        "dependencies": deps,
        "modules": modules,
    }


def parse_gradle() -> dict:
    gradle_files = [ROOT / "build.gradle", ROOT / "build.gradle.kts"]
    gradle_file = next((path for path in gradle_files if path.exists()), None)
    if not gradle_file:
        return {}
    text = read_text(gradle_file)
    dependencies = []
    for match in re.finditer(r"""['"]([\w.-]+:[\w.-]+(?::[\w.+-]+)?)['"]""", text):
        dependencies.append(match.group(1))
    java_match = re.search(r"(?:sourceCompatibility|targetCompatibility)\s*=\s*['\"]?([\w.]+)", text)
    boot_match = re.search(r"id\s+['\"]org\.springframework\.boot['\"]\s+version\s+['\"]([^'\"]+)", text)
    return {
        "artifact": ROOT.name,
        "spring_boot": boot_match.group(1) if boot_match else "",
        "java": java_match.group(1) if java_match else "",
        "dependencies": sorted(set(dependencies)),
        "modules": [],
    }


def detect_build_tool() -> str:
    if (ROOT / "pom.xml").exists():
        return "Maven"
    if (ROOT / "build.gradle").exists() or (ROOT / "build.gradle.kts").exists():
        return "Gradle"
    return "not found"


def detect_project_shape(pom: dict) -> str:
    pom_files = [path for path in find_files("pom.xml") if path != ROOT / "pom.xml"]
    gradle_files = find_files("build.gradle") + find_files("build.gradle.kts")
    modules = pom.get("modules", [])
    apps = list((ROOT / "src/main/java").rglob("*Application.java"))

    if len(pom_files) > 1 or len(gradle_files) > 1:
        return "microservice or multi-project candidate - inspect module deployability"
    if modules:
        return "modular monolith or multi-module app - inspect module boundaries"
    if len(apps) > 1:
        return "multi-application candidate - inspect boot apps and deployment units"

    feature_dirs = top_backend_package_dirs()
    business_dirs = [name for name in feature_dirs if name not in {"common", "config", "exception", "exceptions"}]
    if len(business_dirs) >= 4:
        return "feature-based monolith candidate"
    return "single Spring Boot monolith"


def detect_backend_framework(dependencies: list[str]) -> str:
    joined = "\n".join(dependencies).lower()
    if "spring-boot-starter-webflux" in joined:
        return "Spring Boot WebFlux"
    if "spring-boot-starter-web" in joined:
        return "Spring Boot MVC"
    if "spring-boot" in joined:
        return "Spring Boot"
    return "not found"


def detect_database(dependencies: list[str]) -> str:
    joined = "\n".join(dependencies).lower()
    checks = [
        ("Firestore / Spring Cloud GCP", ["firestore", "spring-cloud-gcp"]),
        ("JPA/Hibernate", ["spring-boot-starter-data-jpa", "hibernate"]),
        ("R2DBC", ["spring-boot-starter-data-r2dbc", "r2dbc"]),
        ("MongoDB", ["spring-boot-starter-data-mongodb"]),
        ("Redis", ["spring-boot-starter-data-redis"]),
        ("Flyway migrations", ["flyway"]),
        ("Liquibase migrations", ["liquibase"]),
        ("PostgreSQL driver", ["postgresql"]),
        ("MySQL driver", ["mysql"]),
    ]
    found = [label for label, needles in checks if any(needle in joined for needle in needles)]
    return ", ".join(found) if found else "not found in dependencies"


def detect_security(dependencies: list[str]) -> str:
    joined = "\n".join(dependencies).lower()
    security_files = []
    for path in sorted((ROOT / "src/main/java").rglob("*.java")):
        text = read_text(path)
        if (
            "SecurityFilterChain" in text
            or "@EnableWebSecurity" in text
            or "@EnableMethodSecurity" in text
            or "springframework.security" in text
        ):
            security_files.append(rel(path))
    bits = []
    if "spring-boot-starter-security" in joined:
        bits.append("Spring Security dependency")
    if security_files:
        bits.append("security config/code: " + ", ".join(security_files[:5]))
    return "; ".join(bits) if bits else "no Spring Security setup found"


def top_backend_package_dirs() -> list[str]:
    java_root = ROOT / "src/main/java"
    package_name, _ = find_spring_boot_package()
    if package_name in {"not found", "not declared"}:
        root = java_root
    else:
        root = java_root / Path(package_name.replace(".", "/"))
    if not root.exists():
        return []
    return sorted(path.name for path in root.iterdir() if path.is_dir())


def classify_backend_layers() -> dict[str, list[str]]:
    java_root = ROOT / "src/main/java"
    layers = {
        "controllers": [],
        "services": [],
        "repositories": [],
        "entities_models": [],
        "dto_records": [],
        "mappers": [],
        "validators": [],
        "specifications": [],
        "configs": [],
        "security": [],
        "exceptions": [],
    }
    for path in sorted(java_root.rglob("*.java")):
        text = read_text(path)
        path_text = rel(path).lower()
        if re.search(r"@(RestController|Controller)\b", text):
            layers["controllers"].append(rel(path))
        if "@Service" in text:
            layers["services"].append(rel(path))
        if "@Repository" in text or "Repository" in path.name or "/repository/" in path_text:
            layers["repositories"].append(rel(path))
        if "@Entity" in text or "@Document" in text or "/model/" in path_text or "/entity/" in path_text:
            layers["entities_models"].append(rel(path))
        if "/dto/" in path_text or re.search(r"\brecord\s+\w+", text):
            layers["dto_records"].append(rel(path))
        if "/mapper/" in path_text or path.name.endswith("Mapper.java"):
            layers["mappers"].append(rel(path))
        if "/validator/" in path_text or path.name.endswith("Validator.java"):
            layers["validators"].append(rel(path))
        if "/specification/" in path_text or path.name.endswith("Specification.java"):
            layers["specifications"].append(rel(path))
        if "@Configuration" in text or "/config/" in path_text:
            layers["configs"].append(rel(path))
        if "/security/" in path_text or "SecurityFilterChain" in text or "springframework.security" in text:
            layers["security"].append(rel(path))
        if "/exception" in path_text or "@ExceptionHandler" in text or "ControllerAdvice" in text:
            layers["exceptions"].append(rel(path))
    return layers


def frontend_root() -> Path:
    candidates = [ROOT / "src/main/frontend", ROOT / "frontend", ROOT / "web", ROOT]
    for candidate in candidates:
        if (candidate / "package.json").exists():
            return candidate
    return ROOT / "src/main/frontend"


def detect_package_manager(frontend: Path) -> str:
    if (frontend / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (frontend / "yarn.lock").exists():
        return "yarn"
    if (frontend / "bun.lockb").exists() or (frontend / "bun.lock").exists():
        return "bun"
    if (frontend / "package-lock.json").exists():
        return "npm"
    return "not found"


def detect_frontend_approach(package_json: dict, src: Path) -> tuple[str, str, str]:
    deps = {**package_json.get("dependencies", {}), **package_json.get("devDependencies", {})}
    dep_names = set(deps)

    framework = "React/Vite" if "vite" in dep_names and "react" in dep_names else "not found"

    if "@tanstack/react-router" in dep_names:
        routing = "TanStack Router"
    elif "react-router-dom" in dep_names or "react-router" in dep_names:
        routing = "React Router"
    elif (src / "routes").exists():
        routing = "file/routes folder found"
    else:
        routing = "not found"

    state_bits = []
    if "@tanstack/react-query" in dep_names:
        state_bits.append("TanStack Query")
    if "zustand" in dep_names:
        state_bits.append("Zustand")
    if "@reduxjs/toolkit" in dep_names or "redux" in dep_names:
        state_bits.append("Redux")
    if (src / "store").exists():
        state_bits.append("local store folder")
    state = ", ".join(state_bits) if state_bits else "not found"
    return framework, routing, state


def detect_api_pattern(src: Path, deps: dict) -> str:
    bits = []
    if "axios" in deps:
        bits.append("axios dependency")
    for candidate in [
        src / "shared/api/axiosClient.ts",
        src / "config/axios-config.tsx",
        src / "services/api",
    ]:
        if candidate.exists():
            bits.append(rel(candidate))
    return ", ".join(bits) if bits else "not found"


def detect_component_patterns(src: Path) -> str:
    bits = []
    for candidate in [
        src / "features",
        src / "shared/components",
        src / "shadcn/components/ui",
        src / "view/pages",
        src / "view/layout",
    ]:
        if candidate.exists():
            bits.append(rel(candidate))
    return ", ".join(bits) if bits else "not found"


def frontend_summary() -> dict:
    frontend = frontend_root()
    package_json = load_json(frontend / "package.json")
    src = frontend / "src"
    env_names = []
    for env_file in sorted(frontend.glob(".env*")):
        for line in read_text(env_file).splitlines():
            if not line.strip() or line.strip().startswith("#") or "=" not in line:
                continue
            env_names.append(f"{env_file.name}:{line.split('=', 1)[0].strip()}")
    all_deps = {**package_json.get("dependencies", {}), **package_json.get("devDependencies", {})}
    framework, routing, state = detect_frontend_approach(package_json, src)
    is_vite_react_ts = (frontend / "vite.config.ts").exists() and "react" in all_deps and "typescript" in all_deps
    architecture_dirs = [
        rel(path)
        for path in [src / "app", src / "routes", src / "features", src / "shared", src / "assets", src / "styles"]
        if path.exists()
    ]
    return {
        "root": frontend,
        "package_manager": detect_package_manager(frontend),
        "framework": framework,
        "vite_react_typescript": "yes" if is_vite_react_ts else "no or not fully detected",
        "routing": routing,
        "state": state,
        "api_pattern": detect_api_pattern(src, all_deps),
        "component_pattern": detect_component_patterns(src),
        "architecture_dirs": architecture_dirs,
        "scripts": package_json.get("scripts", {}),
        "dependencies": package_json.get("dependencies", {}),
        "dev_dependencies": package_json.get("devDependencies", {}),
        "routes": [rel(path) for path in sorted((src / "routes").rglob("*.tsx"))] if (src / "routes").exists() else [],
        "services": [rel(path) for path in sorted((src / "services").rglob("*.ts*"))] if (src / "services").exists() else [],
        "schemas": [rel(path) for path in sorted((src / "dto").rglob("*Schema.ts"))] if (src / "dto").exists() else [],
        "stores": [rel(path) for path in sorted((src / "store").rglob("*.ts*"))] if (src / "store").exists() else [],
        "ui_dirs": [rel(path) for path in [src / "shadcn/components/ui", src / "view/pages", src / "view/layout"] if path.exists()],
        "env_names": sorted(set(env_names)),
    }


def print_list(title: str, values: Iterable[str], limit: int = 20) -> None:
    items = list(values)
    print(f"### {title}")
    if not items:
        print("- none found")
        return
    for item in items[:limit]:
        print(f"- {item}")
    if len(items) > limit:
        print(f"- ... {len(items) - limit} more")


def main() -> int:
    package_name, app_file = find_spring_boot_package()
    pom = parse_pom(ROOT / "pom.xml")
    gradle = parse_gradle()
    build = pom or gradle
    dependencies = build.get("dependencies", [])
    backend_layers = classify_backend_layers()
    frontend = frontend_summary()

    print("# Project Snapshot")
    print()
    print(f"- Repository root: `{ROOT}`")
    print(f"- Project shape: `{detect_project_shape(build)}`")
    print(f"- Build tool: `{detect_build_tool()}`")
    print(f"- Backend framework: `{detect_backend_framework(dependencies)}`")
    print(f"- Spring Boot package: `{package_name}`")
    print(f"- Spring Boot application file: `{app_file}`")
    print(f"- Backend artifact: `{build.get('artifact') or 'not found'}`")
    print(f"- Java version: `{build.get('java') or 'not found'}`")
    print(f"- Spring Boot version: `{build.get('spring_boot') or 'not found'}`")
    print(f"- Database/data access: `{detect_database(dependencies)}`")
    print(f"- Security/auth setup: `{detect_security(dependencies)}`")
    print(f"- Spring Cloud version: `{build.get('spring_cloud') or 'not found'}`")
    print(f"- Spring Cloud GCP version: `{build.get('spring_cloud_gcp') or 'not found'}`")
    print(f"- Node/npm from Maven: `{build.get('node') or 'not found'}` / `{build.get('npm') or 'not found'}`")
    print()

    print_list("Backend Top Package Directories", top_backend_package_dirs())
    print()
    print_list("Backend Dependencies", dependencies)
    print()
    for title, key in [
        ("Backend Controllers", "controllers"),
        ("Backend Services", "services"),
        ("Backend Repositories", "repositories"),
        ("Backend Entities/Models", "entities_models"),
        ("Backend DTOs/Records", "dto_records"),
        ("Backend Mappers", "mappers"),
        ("Backend Validators", "validators"),
        ("Backend Specifications", "specifications"),
        ("Backend Config", "configs"),
        ("Backend Security", "security"),
        ("Backend Exceptions", "exceptions"),
    ]:
        print_list(title, backend_layers[key])
        print()

    print("## Frontend")
    print()
    print(f"- Frontend root: `{rel(frontend['root'])}`")
    print(f"- Package manager: `{frontend['package_manager']}`")
    print(f"- Framework: `{frontend['framework']}`")
    print(f"- Vite React TypeScript: `{frontend['vite_react_typescript']}`")
    print(f"- Routing: `{frontend['routing']}`")
    print(f"- State/data management: `{frontend['state']}`")
    print(f"- API pattern: `{frontend['api_pattern']}`")
    print(f"- Component pattern: `{frontend['component_pattern']}`")
    print()
    print_list("Frontend Architecture Directories", frontend["architecture_dirs"])
    print()
    print("### Scripts")
    scripts = frontend["scripts"]
    if scripts:
        for name, command in scripts.items():
            print(f"- `{name}`: `{command}`")
    else:
        print("- none found")
    print()

    print_list("Frontend Dependencies", [f"{name}: {version}" for name, version in frontend["dependencies"].items()])
    print()
    print_list("Frontend Dev Dependencies", [f"{name}: {version}" for name, version in frontend["dev_dependencies"].items()])
    print()
    print_list("Routes", frontend["routes"])
    print()
    print_list("Services/API", frontend["services"])
    print()
    print_list("DTO/Schema Files", frontend["schemas"])
    print()
    print_list("Stores", frontend["stores"])
    print()
    print_list("UI Directories", frontend["ui_dirs"])
    print()
    print_list("Environment Variable Names", frontend["env_names"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
