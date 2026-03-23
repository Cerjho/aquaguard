from setuptools import find_packages, setup

setup(
    name="aquaguard-detection-engine",
    version="0.1.0",
    description="AquaGuard detection engine package",
    packages=find_packages(where="..", include=["detection_engine*", "config*"]),
    package_dir={"": ".."},
)
