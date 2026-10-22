// Jest stand-in for lucide-react-native, whose ESM-only build Jest can't load.
// Every named export is a component that renders nothing; the real icons are
// checked by the type checker (imports) and seen in the app.
module.exports = new Proxy(
  { __esModule: true },
  {
    get(target, name) {
      if (name in target) return target[name];
      const Stub = () => null;
      Stub.displayName = String(name);
      return Stub;
    },
  }
);
