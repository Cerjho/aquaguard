"""Quick script to check what users exist in the database."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from models import User

app = create_app()
with app.app_context():
    users = User.query.all()
    print(f"\n=== Users in database: {len(users)} ===\n")
    for user in users:
        print(f"Username: {user.username}")
        print(f"Role: {user.role}")
        print(f"Password hash: {user.password_hash[:50]}...")
        print()

    if not users:
        print("⚠️  NO USERS FOUND! You need to run: python seed.py")
