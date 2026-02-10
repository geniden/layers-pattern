# Layer: [LayerName]

## Description
Brief description of what this layer manages.
What entity does it represent? What is its responsibility?

## State Owned
```
state.myEntity = {
  entity1: { id: 'entity1', property: 'value' }
}
```
**Properties managed:**
- `myEntity.*.id` — unique identifier
- `myEntity.*.property` — description

## State Read
```
state.otherEntity.* — why this layer reads it
```
(Write "None" if the layer has no dependencies.)

## State Modified (cross-layer)
```
state.otherEntity.*.field — when and why this layer modifies another layer's state
```
(Omit this section if the layer only writes to its own state.)

## Actions
| Action | Fields | Description |
|--------|--------|-------------|
| `action_name` | `field1`, `field2` | What this action does |

(Write "None — this layer is fully reactive" if it has no external actions.)

## Delta Format
```javascript
// Example delta for action_name:
{ myEntity: { entity1: { property: 'new_value' } } }

// Example delta for removal:
{ myEntity: { entity1: null } }
```

## Notes for AI Agent
- Key architectural decisions and constraints
- Cross-layer interactions
- Testing strategy
- Edge cases to be aware of
