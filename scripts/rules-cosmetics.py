"""Writes the profile, grants and avatar rules for cosmetics and the admin into database.rules.json.
The cosmetic id lists come from src/lib/cosmetics.ts; tests/rules.test.ts checks they stay in sync.
Run: python3 scripts/rules-cosmetics.py"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "src/lib/cosmetics.ts").read_text()

def ids(kind_const, unlock):
    block = re.search(kind_const + r": readonly Cosmetic\[\] = \[(.*?)\];", src, re.S).group(1)
    return [m.group(1) for m in re.finditer(r'\{ id: "([a-z0-9-]+)",[^}]*unlock: "' + unlock + '"', block)]

ADMIN = "(auth != null && auth.token.email_verified === true && auth.token.email.toLowerCase() === 'itzdutchs@gmail.com')"
# Avatar JSON strings: no escapes (so "zuno" can't be smuggled in as \\u007auno), and the exclusive Zuno items only for the admin.
AVATAR = "newData.isString() && newData.val().length <= 21000 && !newData.val().contains('\\\\') && (!newData.val().contains('\"zuno\"') || " + ADMIN + ")"

def equip(const, folder):
    free = "|".join(ids(const, "free"))
    ach = "|".join(ids(const, "achievement"))
    return " || ".join([
        f"newData.val().matches(/^({free})$/)",
        f"(newData.val().matches(/^({ach})$/) && newData.parent().child('achievements').child(newData.val()).child('at').isNumber())",
        f"(newData.val() !== 'zuno' && root.child('grants').child($uid).child('{folder}').child(newData.val()).val() === true)",
        f"(newData.val() === 'zuno' && auth.uid === $uid && {ADMIN})",
    ])

rules_path = root / "database.rules.json"
rules = json.loads(rules_path.read_text())
r = rules["rules"]

def fix_avatars(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "avatar" and isinstance(v, dict) and ".validate" in v:
                v[".validate"] = AVATAR
            else:
                fix_avatars(v)
fix_avatars(r)

PUBLIC = "auth != null"
r["profiles"] = {
    ".read": ADMIN,
    "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        "username": {".read": PUBLIC, ".validate": "newData.isString() && newData.val().length >= 2 && newData.val().length <= 24 && root.child('usernames').child(newData.val().toLowerCase()).val() === $uid"},
        "avatar": {".read": PUBLIC, ".validate": AVATAR},
        "createdAt": {".read": PUBLIC, ".validate": "newData.isNumber()"},
        "email": {".validate": "newData.isString() && auth != null && auth.token.email != null && newData.val() === auth.token.email.toLowerCase()"},
        "sidebar": {".validate": "newData.isString() && newData.val().matches(/^(left|top|right|bottom)$/)"},
        # The admin may take items off anyone (forced unequip); only deletes pass validation for other accounts' rare items.
        "equippedDecoration": {".read": PUBLIC, ".write": ADMIN, ".validate": "newData.isString() && (" + equip("DECORATIONS", "decorations") + ")"},
        "equippedNameStyle": {".read": PUBLIC, ".write": ADMIN, ".validate": "newData.isString() && (" + equip("NAME_STYLES", "nameStyles") + ")"},
        "achievements": {
            ".read": PUBLIC,
            "$id": {
                ".validate": "$id.matches(/^[a-z0-9-]{1,24}$/) && newData.hasChild('count')",
                "count": {".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000"},
                "at": {".validate": "newData.isNumber()"},
                "seen": {"$i": {".validate": "newData.isString() && newData.val().length <= 32"}},
                "$other": {".validate": False},
            },
        },
        "$other": {".validate": False},
    },
}
r["grants"] = {
    ".read": ADMIN,
    "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": ADMIN,
        "$kind": {
            ".validate": "$kind === 'decorations' || $kind === 'nameStyles'",
            "$id": {".validate": "newData.val() === true && $id.matches(/^[a-z0-9-]{1,24}$/) && ($id !== 'zuno' || $uid === auth.uid)"},
        },
    },
}
# Keep usernames last, as before.
r["usernames"] = r.pop("usernames")
rules_path.write_text(json.dumps(rules, indent=2, ensure_ascii=False) + "\n")
print("ok")
