## ADDED Requirements

### Requirement: Chart Event Markers
The application SHALL display visual markers on the performance chart for significant events such as deposits and withdrawals.

#### Scenario: Chart renders with historical events
- **WHEN** the chart is loaded with historical data containing `deposit` or `withdrawal` events
- **THEN** markers are rendered at the exact timestamp of those events.
- **THEN** hovering over a marker displays details of the event (amount and type).
