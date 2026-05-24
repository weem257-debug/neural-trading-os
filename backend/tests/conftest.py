"""
pytest conftest — global warning filters applied before any app import.
"""
import warnings

# passlib 1.7.4 + bcrypt ≥ 4.0: passlib tries to read bcrypt.__about__.__version__
# which doesn't exist, catches the AttributeError, then re-emits it as a UserWarning.
# Filter must be registered before any passlib import occurs.
warnings.filterwarnings("ignore", message=r".*error reading bcrypt version.*")
warnings.filterwarnings("ignore", message=r".*\(trapped\).*bcrypt.*")
