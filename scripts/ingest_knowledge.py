import subprocess
import sys


def main() -> int:
    command = ["npx", "tsx", "scripts/ingest_knowledge.ts", *sys.argv[1:]]
    return subprocess.call(command)


if __name__ == "__main__":
    raise SystemExit(main())
