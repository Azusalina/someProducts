# Git Bash: source /c/path/to/win-filex/shell/filex.bash
filex() {
    local filex_root filex_exe filex_cwd filex_target filex_status
    filex_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)" || return
    filex_exe="$filex_root/bin/filex.exe"
    [[ -f "$filex_exe" ]] || filex_exe="$filex_root/target/release/filex.exe"
    [[ -f "$filex_exe" ]] || { printf 'filex: run scripts/build.ps1 first\n' >&2; return 1; }
    command -v cygpath >/dev/null || { printf 'filex: this wrapper requires Git Bash (WSL: use ../fileX)\n' >&2; return 1; }
    filex_cwd="$(mktemp)" || return
    local -a filex_runner=()
    if [[ -t 0 && -t 1 && -z ${WT_SESSION:-} && -n ${MSYSTEM:-} ]] && command -v winpty >/dev/null; then filex_runner=(winpty); fi
    FILEX_ROOT="$(cygpath -w "$filex_root")" FILEX_CWD_FILE="$(cygpath -w "$filex_cwd")" "${filex_runner[@]}" "$filex_exe" "$@"
    filex_status=$?
    if [[ $filex_status == 0 && -s "$filex_cwd" ]]; then
        IFS= read -r filex_target < "$filex_cwd"
        filex_target="${filex_target%$'\r'}"
        filex_target="$(cygpath -u "$filex_target")"
        if [[ -d "$filex_target" ]]; then builtin cd -- "$filex_target" || filex_status=$?; fi
    fi
    rm -f -- "$filex_cwd"
    return "$filex_status"
}
