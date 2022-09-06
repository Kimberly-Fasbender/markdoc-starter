---
title: Manually Generate New CA Certificate for Temporal Namespaces
---
# {% $markdoc.frontmatter.title %}
Instructions for an internal on call engineer to generate new CA certificates and keys for Temporal namespaces

## Manually Generating a New Certicate

Temporal namespace certificates have a shelf life of 1 year. Before they expire they need to be swapped out for new certificates and keys which can be generated in AWS Secrets Manager.

{% callout type="note" %}
**Note**: The production and demo environments of temporal-service share the same certificate, while the test environment has one of its own.
{% /callout %}

### Generate The New Certificates
Security has provided us with a script to generate a new CA certificate and key. To execute this script, run `yarn new-temporal-cert` from the temporal-service repository.

Generate 2 certificates (run the script twice), one for the production and demo environments to share and another for the test environment.

### Verify Certificate Generation
The script currently saves newly generated certificates and keys under a secret name with the following prefix: `temp-temporal-$UUID/rootca/`

Navigate to the Secrets Manager in the AWS Console and search for the secret names (two ending in `/cert` and two ending in `/key`). You will be able to identify the ones you just created based on their creation date in the event that there are older temporary certificates still remaining from a previous generation cycle.

Retrieve the secrets to make sure both certificates and keys were generated successfully. To do so, click on a secret name from the search results list. This will take you to a screen with additional details about the secret. Click on the button labeled ‘Retrieve secret value’ in the ‘Secret value’ section, and the certificate or key value will be displayed on the screen.

If there appears to be an issue with the generation of a certificate or key, please reach out to the security team in the #security-team slack channel for assistance.

## Share New Certificates with Temporal
Once the new certificates have been generated, open a ZenDesk ticket with Temporal.

Include the following information:

- Inform them that the Temporal namespace certs & keys are about to expire and provide their expiration date(s)

- Copy/paste the new cert values (that were retrieved from Secrets Manager in the previous step)
    {% callout type="note" %}
    **Important**: DO NOT share the key with them. If you do so by mistake, a new cert and key will need to be generated.
    {% /callout %}

- Remind them to leave the older certs and keys active, in addition to the new ones, so that our customers don’t experience any downtime while we swap them out on our end.

- The cert for the test environment should be granted RO access, while the cert for the demo and production environments should be granted RW access.

## Create Backup Certificates
Backup the current certificates and keys, the ones that will be expiring soon, by saving them to new temporary secrets in Secrets Manager.

This is insurance in case something goes wrong during the swap so the expiring certs and keys can be quickly put back in place to prevent our service(s) from staying down while we troubleshoot the issue with the new certs.

1. Create 4 new secrets. Possible names:
    - `temp-backup/prod/temporal/x509/root-ca/cert`
    - `temp-backup/prod/temporal/x509/root-ca/key`
    - `temp-backup/test/temporal/x509/root-ca/cert`
    - `temp-backup/test/temporal/x509/root-ca/cert`
2. Retrieve the current cert and key values from:
    - `prod/temporal/x509/root-ca/cert`
    - `prod/temporal/x509/root-ca/key`
    - `test/temporal/x509/rootca/cert`
    - `test/temporal/x509/rootca/key`
3. Copy/paste them into the values for the temp-backup secrets by clicking ‘Retrieve secret value’ and then ‘edit’ in the AWS Secrets Manager console.

### Wait to Hear Back From Temporal
Wait to hear back from Temporal that the new cert is in place before continuing on, otherwise temporal-service will go down and our customers will be unable to work.

## Swap in the New Certs and Keys
**Only move forward if you have heard back from Temporal that the new certs are in place**

This should be done during lower traffic times on temporal-service if possible, in the event that the new certificate is not accepted for some reason and we experience some downtime.

### Test Environment
You do not need to restart any pods for this since these certs are only being used by the Workflow Replayer in CircleCI.

1. Update the following secret values for the **TEST** environment with the new cert & key:
    - `test/temporal/x509/rootca/cert`
    - `test/temporal/x509/rootca/key`

2. Open up a draft PR for temporal-service and verify that the CircleCI job for replaying workflows is passing.

### Demo Environment
1. Update the following secret values for the **DEMO** environment with the new cert and key:
    - `demo/temporal/x509/root-ca/cert`
    - `demo/temporal/x509/root-ca/key`

2. Restart all http, agent, and canary pods for `temporal-service-demo` using Lens. Instructions [here](#restarting-kubernetes-pods). This needs to be done because the cert and key are retrieved from Secrets Manager once at startup. If the pods are not restarted, they will still be referencing the old values which will cause authorization errors when Temporal removes references to the old certs on their side, or when they expire.

3. Watch for any pages or outages

4. Trigger a test workflow in demo, navigate to the temporal-service UI, and complete the test work ticket to verify that the certificate is being accepted.

### Prod Environment
1. Update the following secret values for the **PROD** environment with the new cert and key:
    - `prod/temporal/x509/root-ca/cert`
    - `prod/temporal/x509/root-ca/key`

2. Restart all http, agent, and canary pods for `temporal-service-demo` using Lens. Instructions [here](#restarting-kubernetes-pods). This needs to be done because the cert and key are retrieved from Secrets Manager once at startup. If the pods are not restarted, they will still be referencing the old values which will cause authorization errors when Temporal removes references to the old certs on their side, or when they expire.

3. Watch for any pages or outages.

4. Trigger a test workflow in production, navigate to the temporal-service UI, and complete the test ticket to verify that the certificate is being accepted.

### Notify Temporal to Remove Expiring Certs
Add a comment in the open ZenDesk ticket letting the Temporal team know that they can remove the old certs.

### Schedule Removal of Temp Secrets
Schedule the deletion of the temporary and backup certs and keys in Secrets Manager by navigating to the secret in the AWS console and clicking on the ‘Actions’ drop down while logged in using the DeveloperRW role. In the drop down menu, click on ‘Delete secret’.

## Troubleshooting
### General
- To view the certificate metadata (expiration date, etc.), use the following script:
  ```
  aws secretsmanager get-secret-value --secret-id <secret name here> | jq -r .SecretString | openssl x509 -text -noout
  ```

- If you need further assistance from Temporal, reach out in the #temporal-support slack channel.

- If you schedule the deletion of a cert or key in Secrets Manager on accident, or need to remove it from the deletion schedule, navigate to the SecretsManager settings and check the box next to 'show secrets scheduled for deletion' in order to search for them and remove them from the schedule.

### Restarting Kubernetes Pods
1. In the search bar on the top-right, find the namespace for your service (e.g. temporal-service)

2. Select the ‘Deployments’ tab

3. Click the 3 dots on the right of the deployment you want to restart (e.g. temporal-service-http-primary-#######) + click restart

### Supporting Documents
[AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)

[Lens Documentation](https://docs.k8slens.dev/main/)
