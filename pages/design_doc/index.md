---
title: Work Session Clean Up Design
---
# {% $markdoc.frontmatter.title %}
Technical design document for internal developer and data science audience proposing a solution to a workflow platform problem

## Background
### Terminology
- **business process**: A single discernible unit of work, on or with a real world entity (shipment, shipment stop, location profile, etc).

- **Temporal**: a developer-first, open source platform that ensures the successful execution of services and applications (using workflows)

- **workflow**: an orchestrated and repeatable pattern of activity, enabled by the systematic organization of resources into processes that transform materials, provide services, or process information. For more detailed information on Temporal workflows see docs [here](https://docs.temporal.io/workflows).

- **child workflow**: a workflow that has been triggered by another workflow. The parent workflow it was triggered from may or may not need to wait on this child workflow to complete.

- **work-session-service (WSS)**: A backend service responsible for creating, managing, and assigning work to be put in front of our end users.

- **work task**: A single piece of work to be displayed in an internal UI and completed by a user as part of a workflow. Can be in one of the following states: AVAILABLE (available to be picked up by a user), ACTIVE (is actively assigned to a user), COMPLETED (user has completed the work), WONT_DO (the system has determined that the work is no longer needed).

- **work session**: A group of one or more work tasks, which are expected to be completed together as a set by a user, as part of a workflow. Can be in one of the following states: READY (ready to be assigned to a user), PROCESSING (the system is checking for the next task in the session), COMPLETED (all tasks in the session have been completed by the user), WONT_DO (the system has determined that the work is no longer needed).

### Problem Statement
Sometimes workflows will be terminated or, ideally, cancelled mid-flight. This can happen for a variety of reasons (a bug is found and cancellation is deemed the best mitigation strategy, an event occurs that renders the workflow outdated, etc). For many scenarios, this can mean that a workflow which created work in work-session-service (i.e. work to put in front of an end user) is cancelled. In that case, we need a mechanism for that work to be removed from the queue. Also, in its current implementation when a workflow is cancelled any in progress work sessions that are a product of that workflow are left hanging in a ‘PROCESSING’ state, causing our data to be inaccurate. We will need to do some clean up to gracefully handle work session cancellations.

## Proposed Solution
For workflows that are cancellable, a top-level [CancellationScope](https://docs.temporal.io/docs/typescript/cancellation-scopes/#external-cancellation-example) wrapper can be leveraged for any interactions with work-session-service. Note: This does not solve for workflow termination which is beyond the scope of this design, only cancellation.

There are a few different scenarios in which we expect workflows to be cancelled:
1. **Business Process Cancellations**
    *Example*: The underlying shipment for a scheduling workflow is cancelled
    
    In these cases any work or actions, that aren’t already in progress by a user, should be prevented from continuing forward. This will require some clean up in work-session-service to close out unassigned work sessions and work tasks. Also, workflow owners will need a way to undo any work that was already completed and may need to be undone. This could mean authors creating “down” work tasks, tasks that are the opposite of the work tasks that have been (or could be) completed. For example, given that a task to schedule an appointment has already been completed, the down task for that might be to unschedule that appointment.
2. **Invalid Workflow State Cancellations**
    *Example*: There’s an unrecoverable bug in the workflow. 
    
    In these cases the business processes likely should not be ended, but rather the issue should be rectified and the workflow should continue from wherever we left off. For example, if there was a bug in a scheduling workflow and a task was already completed to schedule an appointment, that work would still be valid. There just needs to be a way for the subsequent workflow to pick back up from that point, update our internal systems and continue. It would be a really negative experience for both internal and external users for us to first undo the task, and then redo it again just because workflows needed to be cancelled.
3. **Purge Workflow Cancellations**

    *Example*: These workflows aren’t needed anymore, just make them go away.
    
    This is something that has been leveraged recently with scheduling workflows. It is unlikely that this scenario is one that would be used validly within production. In the event that the workflows are no longer valid, for example, they should be handled like a business process cancellation (undoing any already completed work, and marking the work sessions and tasks appropriately so that they aren’t left hanging).

In order to prove out a pattern that works for all of these scenarios, handshake diagrams will be leveraged to explore all happy and unhappy paths. Here are a few implementation details that are important for understanding the diagrams. 

- **cleanUpWorkSession endpoint**: For work session cleanup a new endpoint in work-session-service is needed: `cleanUpWorkSession`. It will take in a work session id, fetch the work session and its associated work tasks and then mark them all appropriately so that nothing is left in a ‘PROCESSING’, ‘ACTIVE’, or ‘AVAILABLE’ state. For example, if a work session has been created, but not yet assigned, its state should be updated to ‘CANCELLED’ (a new state) and all of its work tasks would have their state updated to ‘WONT_DO’. However, If a work session has been assigned and is in progress, all un-assigned (not yet picked up) associated work tasks would have their state updated to ‘WONT_DO’, while any in-progress (assigned) work tasks would not have their state updated (they would be marked as ‘COMPLETED’ once the user finishes the task via the `completeWorkSessionTask` endpoint or as ‘WONT_DO’ in the event of stale un-assignment (more details to come in the stale un-assignment bullet point), and the work session would still be updated to the new ‘CANCELLED’ state.

- **workflowCleanup**: refers to any work that a workflow author may need to do in order to gracefully handle a cancellation. Authors shouldn’t be limited in the ways in which they can handle this cleanup, but should be enabled to do whatever is necessary here. Some patterns or templates can be established in order to make this process easier for workflow authors, but ultimately it will be up to them to make decisions about what to do if partially or fully completed work is cancelled since they are the experts in their spaces. One option is that for any work task created, a ‘down’ task is created as well, and then used to unravel or undo any work when necessary. Similar to up and down database migrations. The down tasks could then be fed into a clean up workflow that is kicked off when a workflow is cancelled (most likely a non-cancellable child workflow). This goes exceeds the scope of this design, but should be explored in a separate document.

- **Stale Un-assignment**: The `unassignStaleWork` function, which checks if a user has been assigned to work task for too long (logged off, went to lunch, etc) and unassigns it, will need to be updated to check if the work session state is ‘CANCELLED’ and if so, un-assign the user from the task and mark the task as ‘WONT_DO’.After investigation it doesn’t appear that there should be any issues with re-using ‘WONT_DO’ for these cases (vs. creating a new work task state of ‘CANCELLED’), but if anything surfaces that would suggest re-using this would be a conflict, a new task state of ‘CANCELLED’ should be created instead.

- **closeWorkSession**: A non-cancellable wrapper would need to be added to the existing `closeWorkSession` function as well, to ensure work sessions are properly closed out in the event of workflow cancellations.

{% callout type="note" %}
One caveat to starting an activity in a nonCancellable scope is that it could run indefinitely if it wound up stuck in a retry loop due to an unhandled error. Per guidance from Temporal, this could be avoided by wrapping the nonCallable wrapper with a cancellable scope, which could then in turn be cancelled if needed.
{% /callout %}

### Business Process Cancellation
*Example*: The underlying shipment for a scheduling workflow is cancelled

**Happy Path 1 - Workflow is cancelled before work session is created:**
![bp: happy path 1](https://i.ibb.co/6vpYRZM/bp-happy-path-1.png)
[Live Diagram](https://mermaid.live/edit#pako:eNqVUsFqwzAM_RVhGGyQQdvRSw49dCvsNAo97OKLY6upaSJlttMSSv99SprCtjLYZLDN09OTLPmkLDtUuYr40SJZfPGmDKbWdHcHyzZ6whhhHdj257MRRoVu8L6apulgbdIuhyOH_bbiI9iBIRQocMsBBw9ECfZMYAOa1IcvV7DBcPAWHxeL92vwCF3kgBCd6IgKICWfOpjOnjT9ZP8qMCAxmfDnjN9TATFUTCWGsRRNAW2CUBb3s8kkg-lcttl8_qDpjRMCH4R6Kz22xKS-A9Fyg5r--wxboaG20YQkZYBYr3G74IupTNUYauOdjPfU-7RKO6xRq1yuzoS9VtkFL9h1PXwaxVVh7L4M3Eq6gV1UAmjVu8-azqLdNk5muXI-cVD51lQRM2XaxJuOrMpTaPFKGv_UyDp_Ar-J2s0)

**Happy Path 2 - Workflow is cancelled after work session is created, but work session is not yet assigned:**
![bp: happy path 2](https://i.ibb.co/zHvqnGV/bp-happy-path-2.png)
[Live Diagram](https://mermaid.live/edit#pako:eNqNU8Fq4zAQ_ZVBULILCTQpufhQaJtADyUtuEsvgkWWJq6JM_JK4xYT8u87ih1omg2sbCQz8-bpvZG8U9Y7VJmK-KdFsrioTBnMVtPVFcj7aJqmgxfD7xl8-rCBiDFWnsAGNIwOipaBPEOHDEZSJaHTdL-EHMNHZXFye_smdevafx5DAxMhOiFY-wBIXHEH09mNpu_oRJDn2bBhyua9hMtQ41xKvZq4iTABlhWm_yfqVI04g9pTiWFQqymgZQhl8WN2fT2G6Vym2Xz-UxPIWHlG8B8CP6e3Rrpb14ZT96L1DfY1F_3WaOhXc2L4gM_zI-SguHd3dgbiu22cdAwip5k9jN6eV6-_F8-jM6IBeXLAfdkERg93q4fl09NyMbos-J_NPEQONmQDTUgO9GAirecPfBlqrLYYtqZycjl3KacVv-MWtcrk05mw0WrcxwvvuhTeDeSqMHZTBt-S69FFLQGtUnqvaS_cveOlq9gHla1NHXGsTMs-78iqjEOLR9DwRwyo_V-sLBSm)

**Unhappy Path 1 - Workflow is cancelled while work session is assigned and in progress:**
![bp: unhappy path 1](https://i.ibb.co/Hp2Y9CP/bp-unhappy-path-1.png)
[Live Diagram](https://mermaid.live/edit#pako:eNrFVN9r2zAQ_lcOQdcNEmg88uKHQtvkoZAlBSf0xTAU6-KYOJInyS0m5H_fybIb59e6PU0GS9zd993pu7N3LFECWcgM_ipRJjjKeKr5NpY3N7CQa14UFbxwuw7hXekNGDQmUxI4balEAV8gk1BolWryxBJoPY4hQv2WJdi_v38l1CpX762p4ZGIgtArpQGlzWwFg-C7h58iHEkUhZBo5BadN_JF_DmcC-Fcc242BvpgaYfBv0MCD3mWFrXkOSye2-gU7Uw_1Do4VEMdReTvRIeNVMbf25cBVkFpUP-9XsdCgVSQK5miboT0RBoTCzpdfg3u7nowGNIrGA6_eadbU2UR1BvBztMknLqf59y69ppEFXjAXW1JjlwuirOeHJSow7o370wLSUz3KAtBbXWKGEuHTwgCglio0B4msN9S1HhH9Dqbzn-OZrfXudoxPq7mlOf26WH6NJ5MxqOGCqW4Og6J2hY5Hg2oG6TT0TsU0mTriuMz9ynx7MfLZDz_SPwfOqsMXu7rBcTFma0t9YTQVTv6-aPbzx_oLNZjW9Rbngn6Pe2cL2Z2jVuMWUhHwembYz1vXypROfOuIWdLnmxSrUpKWEcvczLEzLn3sdwTt5d_LDKrNAtXPDfYY7y0KqpkwkKrS2yDmn9iE7X_DQUAsh0)

**Unhappy Path 2 - Stale un-assignment sub case:**
![bp: unhappy path 2](https://i.ibb.co/X3HYcRn/bp-unhappy-path-2.png)
[Live Diagram](https://mermaid.live/edit#pako:eNq9VE1r4zAQ_SuDoF-QQOMlFx8KaZNDoSQLbsjFUBR54pg4kleSW0zIf9-RZROlaemeVgZLaN48ad48-8CEypDFzOCfGqXAacFzzfepvLqCpdzyqmrgN7fbGD6U3oFBYwolgdOUS8zgGgoJlVa5pkgqgcbjDBLU74XA4cPDirI2pfro8iViRlkbpQGlLWwDo-iXT-uRLilJYhAauUW3m_hDv4bxLHNbr9zsDAzB0gyjf4dGHvosLWrJS1g-9-gc7UJP2jpdVkeZJBQP0HEnhfH1-ePBKqgN6p_1OBcCpIJSyRx1J5Qn0Cgs6Hx9G93fD2A0plc0Ht_5oBtzZRHUO6Wd6AWnbpYlt65dRqgKT_gLqUvkclldaH2quIWFFQZdJynp3nWVUbtc5cbS4geCiFIsNGhPThpCz9ESOKab1WL--jZd3HzP1hvy_D4XRE-T-dPs5WU27ahQdtoG0jnOSW3VUvo7JZaXof_AGSe0QZtRf0bDrdiiIIe53gYHd7chnlVy9y2NCYwThn1BYQc83fCzSP_BLMrg11YJkGc2dytvMiokaIBfuvnygWCwAduj3vMioz_VwcVSZre4x5TFtMw4fZ5s4PfXKmvc9qEjZ2sudrlWNR3YotclbaTMhY-pPBK3F3eWFVZpFm94aXDAODkhaaRgsdU19qDu99ihjn8BQMCySg)

**Unhappy Path 3 - Workflow is cancelled after work session has been completed:**
Workflow is still running, possibly doing automated work that does not require user intervention, even though the work session has been completed. 
![bp: unhappy path 3](https://i.ibb.co/99xPthC/bp-unhappy-path-3.png)
[Live Diagram](https://mermaid.live/edit#pako:eNp9U01r4zAQ_SuDoHQXEmiy5OJDYbebQ6G7LbilF10UaeKYyCNXkltCyH_fkeUEpw0rg2Vm3rx58-G90M6gKETAtw5J4-9aVV41kq6u4IU2qm138KTipoAP57dr6z6gDqAVQ61FA2od0cNr2Vtd01qMaCT9WkKJ_r3WOL29fR0iMwcQouHItfOAFOu4g9n8h6QjKgWUZQHao4qYrCWGUDv6ClHGJNOzCtsAU4h8w0zSPbEmUhZe7o_ICuOj_8k0VU_CVGXJvhGS2Xp3yCIzF0QHXUB_kfNY7khiUjISkpP04K41XM0Zd4jJMoXru8c_Tw_L5-X1KeLUsGN5d0MuSBKVvdAt68KnZl1OHrL_Yvb_Te18XEAOrKOKZ5_HKcmjjuCr1bf5zc0EZgt-zReL75KAz1_Hydx7WpUT7bBEKvZytGsxY8elnWnot09bVMQVSULirDkk3V8fGB0xEQ36RtWGl32ffFLEDTYoRcGfRvFSiEm2r5zZJfN-IBcrpbeVdx0n7NErywYpkvsg6cDcucNLU0fnRbFWNuBEqC66ckdaFNF3eAQNf9iAOvwDCN0zqQ)


### Invalid Workflow State Cancellation
_Example_: There’s an unrecoverable bug in the workflow. 

**Happy Path 1 - Workflow is cancelled before work session is created**
![invalid workflow state: happy path 1](https://i.ibb.co/Jcw0sWY/invalid-state-happy-path-1.png)
[Live Diagram](https://mermaid.live/edit#pako:eNptks9Kw0AQxl9lWCgoRGgrveTQg1rQgyL04GUvk91pGrqZjZtNSyh9B-8efEUfwUnTqBV3YRlmft-3s3_2ynhLKlU1vTbEhu4KzAOWmkcjeOAtusLCiw-blfM7WEaMBLconHMYC89H7h6rqoVnjOsUdgNreoosZLTygY4VqKmuRQYmkFhZzTcLWFLYFoau5vNho94GmMiKXtRAHIvYwmR6rXmgzgQNBzJ-SwEzR5A1OXx-vL1rfkRu0Ln2DO57--5Vd9oIIc8upuNxApOZLNPZ7FIzyHjycujOGv469HcAtfEV9ey_vf3ciSNpp9JMLEfvZ6ca4vMJv4ZKVEmhxMLKW-27mlZxTSVplUpoMWy0Svp85m3bpfcnc5Wh2eTBN7Lpkc6cJLTqygfNB_FuKivPsbBF9EGlK3Q1JQqb6JctG5XG0NAAnT7IiTp8AX8JyLk)

**Happy Path 2 - Workflow is cancelled after work session is created, but not yet assigned**
![invalid workflow state: happy path 2](https://i.ibb.co/2g5dGZL/invalid-state-happy-path-2.png)
[Live Diagram](https://mermaid.live/edit#pako:eNplk91q2zAUx1_lICjZIIUmIze-KGxJoIUuHbgjN4JybJ24IorkSXKKCXmH3e9ir7hHmCTbW91YYIuj3_mfL_nESiOIZczRj4Z0SSuJlcUD11dXcK-PqKSArbH7nTKvkHv0BEsMnFLopdGJu8O6buEb-pfsPysdlB1IAnDnycI2T1ZLQUVA0XjQxkNLHtA5WWkSXH9ZQ072KEu6vr0dxDJ4DTvQRCI47owF0l76FmbzT1wPVHTI86wPEK05Bd2Y5HsEhYimJ3R7B9fgwxdmY-xf6EZbKs2RLBaKQtYV_Pn98xfXX1E3qFQ7gruSU7rRwKOvB1sVH-Y3N1OYLcJrvlh85BrCszGhnVEa3it03QVXmpo69qJKRai_16MyE5fnA5Ka1tV20elQdVOLOE6XhuoNTLaPm6fn1ePkQqgnk57rgr1xW37eLNcPD-vV5DLT0QDTvUh5NzXXpMO4uxW9hv14wZuHTdmB7AGlCPf1FM848y90IM6ysBVo95xNO3thRBvNp16cFVjuK2uaEDTRhQoGzuLxmetz0O6KXAvpjWXZDpWjKcPGm7zVJcu8bWiA-p-kp85_AVPbH5M)

**Unhappy Path 1 - Workflow is cancelled while work session is assigned and in progress**
![invalid workflow state: unhappy path 1](https://i.ibb.co/zXLnfqq/invalid-state-unhappy-path-1.png)
[Live Diagram](https://mermaid.live/edit#pako:eNqVVNuK2zAQ_ZVBsGwLCWxS8uKHhW2Sh0A2WXBCXgyLbE0cE1tyJTnBhPxD3_vQX-wndGTHG-fS0trgy-jM0Zwzgw4sUgKZxwx-K1BGOEp4rHkWyIcHmMgdTxMBK6W361TtwbfcIgw54dKU20TJCreUG57nJbxxu_HO6MRAVENRwH6TpAgr30W5MUksKcilgERCrlWs0ZhAfh2Dj3qXRNh9fm6IPNjTF0hEQTlrpQGlTWwJvf6XQDYol-D7HkQaqUgX9YmyKvEawoVwoQU3WwNdsPSG3r_B-oGcSIta8hSWkwYZo53rl0qVyyAq36e1FtI7iTa1lnpLsAoKg_py6w_VhdQYqR1qHpJ1YRHDr5_ffwTylcuCp2l5Aa6drthdIHC5FnQcfuo_PXWgN6BHfzD4HEiga6aoj44arhnqtoKJVI419sbgFLlc5hcOV7hKcwVpa2z1l0yUpDgXbopIu3HjdJOc8Sa5T3ALJdrzxHSb9CrXkTyu5rPF-2j-eL8KU5d4VcYNyfBlNhxPp-PR463os0NOeZG3TEYp7g5EpLI8xYsxdGPUHrZznadi2qbVhXWprvnr23S8-Kjrr139387e764yeNPbP1rSWFF7Q1JqfOVLc7vA-a99Q-tiHZahzngi6DQ6uLWA2Q1mGDCPPgVNRcA6dTxUonThw4mchTzaxloVtG2FDlMKBMwtHwN5JO7a5LFIrNLMW_PUYIfxwiq_lBHzrC6wAZ2OwBPq-BvpGL2e)

**Unhappy Path 2 - Workflow is cancelled after work session has been completed**
![invalid workflow state: unhappy path 2](https://i.ibb.co/hRwHQ9j/invalid-state-unhappy-path-2.png)
[Live Diagram](https://mermaid.live/edit#pako:eNqNU8Fq20AQ_ZVhIaQFB2IXX3QItK4PhqYJKCGXvYy0Y1l4NevurhyM8T_03kN_sZ_QWclqHONDVyAtM2_eezPa3avSGVKZCvSjJS7pa42Vx0bz1RUseIu2NvDi_Hpp3SvkESPBDAVnLcbacYd75hVuNjt4xLjK3tB1gLKHkgFcRvLwksMKAxREDKVrNpYiGc1f5pCT39Yl3dzdDfUZvMoOmMhI_dJ5II513MF48knzgEoFeZ5B6Um8pWhOIXTOziFoTAo9YVgHuIEoXxj_H2yiecHSAKOF58WArCg--M-iVnUkQpXnkjtBCluXDn0vvSREB20gf5FzmMpJJ8nJqd9O5G1Kg9nZsRKSINoLI7IunE2op0rJzl_oE9CgX6d_FuB69nD_-G3-NL9-z_dPvWVPpduSx8ISFG0Ff37__KX5HrlFa3fvwP1x6LRSQKfaCL4qPkxub0cwnsprMp1-1AyyvjtpJlHDOUN_9iCUbkM99qK3QUc6J7Gz0UxserzmSw-cLDVSDfkGayO3Y59yWsUVNaRVJlsjI9Jq1McLZ3YpvD-SqwLLdeVdK3IdurAS0CqlD5oPwt1ujJzXuamj8ypbog00UthGl--4VFn0LQ2g45U8og5_AYCgSoU)


### Purge Workflow Cancellation
*Example*: These workflows aren’t needed anymore, just remove them.

Although not expected for production workflows, these should be handled the same as [Business Process Cancellations](#business-process-cancellation).

## Implementation
### Add New Work Session State
Add new work session state ‘CANCELLED’ to the list of states for a work session.

### Create Clean Up End Point
```
cleanUpWorkSession(input: CleanUpWorkSessionRequest): CleanupWorkSessionResponse

CleanUpWorkSessionRequest: {
	workSessionId: string;
}

CleanUpWorkSessionResponse: {
	success: boolean;
	errorMessage?: string;
}
```

The end point should fetch the work session and its associated work tasks, and update their state appropriately so that none of them are left in a ‘PROCESSING’, ‘ACTIVE’, or ‘AVAILABLE’ state. If the work session has been:

- created but not yet assigned (in a ‘READY’ state && work tasks are all in an ‘AVAILABLE’ or ‘WONT_DO’ state:
  - Update the work session state to ‘CANCELLED’
  - Update all work tasks to state ‘WONT_DO’
- assigned and is in progress (in a ‘READY’ or ‘PROCESSING’ state && at least one work task is not in an ‘AVAILABLE’ or ‘WONT_DO’ state)
  - Update the work session state to ‘CANCELLED’
  - Update any un-assigned work tasks that have not been completed (not yet picked up) to ‘WONT_DO’
  - Do not update the state of work tasks that are in progress (they will be updated once the task is completed, or when the stale un-assignment task picks them up).

### Add Work Session Clean Up
Add a try/catch block which calls a new function, `cleanUpWorkSession` when a workflow is cancelled. For the call to `cleanUpWorkSession` to be successful after cancellation, we can use a top-level [CancellationScope](https://docs.temporal.io/docs/typescript/cancellation-scopes/#external-cancellation-example) wrapper. This should be done at the `waitForTask` level, where work sessions and work tasks are created. 

If this were to be moved further out than this this level (if workflow authors end up needing a workflow template class, or a higher level wrapper in order to hook up cancellation workflow cleanup), more state management would need to built into the workflow file to support work session cleanup. The tradeoffs of doing this may or may not be worth it, so a decision doc would be recommended if this needs to be explored.

In practice, this might look something like this:
```typescript
// new
async cleanUpWorkSession() {
  if (this.workSessionId !== getNilUuid()) {
    this.cleanUpWorkSession(workSessionId); // new endpoint in WSS
  }
}

// current does not include a try/catch with cancellation scope
async waitForTask(workTask: WorkTask, timeoutInMs: number): Promise<TaskResult> {
	try {
		...
		return taskResult;
	} catch (err) {
		if(isCancellation(err)) {
			// Cleanup logic must be in a nonCancellable scope
	    // If cleanup had been run outside of a nonCancellable scope it would've been cancelled
	    // before being started because the Workflow's root scope is cancelled.
			await CancellationScope.nonCancellable(() => cleanUpWorkSession());
		}  
	}
}
```

Workflow authors could leverage a similar wrapper where necessary in order to kick off a cleanup child workflow with down work tasks, or other work for unraveling partially or fully completed production work.

```typescript
if(isCancellation(err)) {
	if(downWorkTask) {
		await CancellationScope.nonCancellable(() => NewChildWorkflow(args));
	}
}
```

### Handle Stale Un-Assignment
Update the unassignStaleWork function. Check if the work session state is ‘CANCELLED’ and if so, un-assign the user from the task and mark it as ‘WONT_DO’. Do not update the work session state, it should remain as ‘CANCELLED’ to prevent the work session from being put back in the queue to be worked on.

## Other Solutions Considered
**Let the Existing Work Session Stay**
The easiest solution is to take no action, option 0. If a work session is created, allow it to be presented to users instead of cancelling it. Some small work would need to be done in order to move work sessions into an end state after the cancellation, but that is all. Currently, the work session gets stuck in a ‘PROCESSING’ state leading to erroneous data.

The major con with this approach is that it wastes the time of our users by forcing them to complete work that is no longer needed, and allowing them to actively take invalid/incorrect actions. For example, scheduling an appointment that we know is no longer needed and which will need to be unscheduled or rescheduled later. This would lead to distrust in our platform, and lead to a pretty poor user experience.

**Leverage Cancellation Scopes to Disallow Cancellation**
Similar to the recommended solution, except that the top level cancellation scope would be used to disallow the cancellation of any workflow that had created work in work-session-service. The cons of this approach are that it limits the flexibility for certain workflow scenarios, and still presents the issue where work is intentionally being placed in front of our users that we know is no longer needed. This again provides our users with a poor overall experience by wasting their time and creating distrust in the platform.
