---
title: Manually Generate New CA Certificate
---
# {% $markdoc.frontmatter.title %}

## Know Why

The certificate and key for Temporal namespaces have a shelf life of 1 year. Before they expire a new certificate and key need to be generated, and swapped in for them in Secrets Manager. 

Note: The same certificate and key are used for both the production and demo environments.

## Generate The New Cert & Key

## Troubleshooting
To view the certificate metadata (expiration date, etc.), use the following script:
```
aws secretsmanager get-secret-value --secret-id <secret name here> | jq -r .SecretString | openssl x509 -text -noout
```

If you need further assistance from Temporal, reach out in the #temporal-support slack channel

If you schedule the deletion of a cert/key in Secrets Manager on accident or need to remove it from the deletion schedule, navigate the the SecretsManager settings and check the box next to 'show secrets scheduled for deletion' in order to search for them and remove them from the schedule.
