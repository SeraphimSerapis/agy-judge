---
name: agy-judge
description: "Run the agy-judge review layer for the current workspace. Activate when the user asks to judge, review with agy-judge, run the judge layer, or check the agent's work with the configured judge endpoint."
---

# agy-judge

When the user asks to run agy-judge, judge the current work, or review the agent's work with the judge layer:

1. Run:

```sh
agy-judge review
```

2. Report the result clearly, including whether the judge returned pass, warn, fail, or block.

3. If the command fails because configuration is missing, run:

```sh
agy-judge status
```

Then explain which judge settings need to be configured.

Do not paste secret environment variables or header values into the response.
