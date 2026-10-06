use blitz_dom::NodeId;

/// The engine-neutral identity of a DOM node.
///
/// It wraps Blitz's versioned node id (32-bit slot, 32-bit version): when a node is dropped
/// and its slot is reused, old handles stop resolving instead of aliasing the new node.
/// Script adapters key their wrapper caches by this value; a wrapper is never the identity.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, PartialOrd, Ord)]
pub struct NodeHandle(u64);

impl NodeHandle {
    pub fn from_raw(raw: u64) -> Self {
        Self(raw)
    }

    pub fn raw(self) -> u64 {
        self.0
    }

    /// Lossless decimal form, for adapters whose engine numbers cannot hold 64 bits.
    pub fn to_decimal(self) -> String {
        self.0.to_string()
    }

    pub fn from_decimal(text: &str) -> Option<Self> {
        text.parse().ok().map(Self)
    }
}

impl From<NodeId> for NodeHandle {
    fn from(id: NodeId) -> Self {
        Self(id.as_u64())
    }
}

impl From<NodeHandle> for NodeId {
    fn from(handle: NodeHandle) -> Self {
        NodeId::from_u64(handle.0)
    }
}
