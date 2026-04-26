"""Environment utility functions."""

def is_truthy(value: str | None) -> bool:
    """Evaluate a string as a boolean truthy value.
    
    Accepts '1', 'true', 'yes', 'on' (case-insensitive) as True.
    Everything else is False.
    """
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}
