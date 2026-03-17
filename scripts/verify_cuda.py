"""Verify CUDA availability for AquaGuard detection engine."""
import torch


def main():
    print("=" * 50)
    print("AquaGuard — CUDA Verification")
    print("=" * 50)
    print(f"PyTorch version : {torch.__version__}")
    print(f"CUDA available  : {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA version    : {torch.version.cuda}")
        print(f"Device name     : {torch.cuda.get_device_name(0)}")
        vram_bytes = torch.cuda.get_device_properties(0).total_memory
        vram_gb = vram_bytes / (1024 ** 3)
        print(f"VRAM total      : {vram_gb:.2f} GB")
        print(f"VRAM allocated  : {torch.cuda.memory_allocated(0) / (1024**2):.1f} MB")
        print("Status: CUDA READY ✓")
    else:
        print("Status: CPU ONLY — no CUDA device found")
        print("Run: nvidia-smi  to verify GPU driver status")


if __name__ == "__main__":
    main()
