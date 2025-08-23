# Provision AWS instance.

## Requirements

- The steps below were successfully tested using:
    - Terraform (0.14.4)
    - Ansible   (2.10.7) Python (3.8.5)

#### Install Terraform

- Go to [url](https://learn.hashicorp.com/tutorials/terraform/install-cli)

#### AWS Credentials.
- Create a credential file at `~/.aws/credentials` or override the location in aws/provider.tf

```
[default]
aws_access_key_id = XXXX
aws_secret_access_key = XXXX
```
#### SSH Credentials.
- In aws/vars.tf the private key and the public keys are assumed to be in the standard location

```
variable "public_key_path" {
  default = "~/.ssh/id_rsa.pub"
}

variable "private_key_path" {
  default = "~/.ssh/id_rsa"
}

```

#### DNS

Need to create two Route53 records pointing to the elastic ip created above.
The two hostnames specified by these records will be used by the apache proxy
to forward traffic to either solr or to the amigo server.

Replace variables AMIGO_DYNAMIC and AMIGO_PUBLIC_GOLR with the hostnames accordingly in vars.yaml.

Note: These values can also be passed using the -e option.


#### Create AWS:

Note: Terraform creates some folders and files to maintain the state.
      Once terraform is applied, you can see them using <i>ls -a aws</i>

```sh
cd provision

# This will install the aws provider.
terraform -chdir=aws init

# Validate the terraform scripts' syntax
terraform -chdir=aws validate

# View the plan that is going to be created.
# This is very useful as it will also search for the elastic ip using
# the supplied eip_alloc_id. And would fail if it does not find it.
terraform -chdir=aws plan

# This will create the vpc, security group and the instance
terraform -chdir=aws apply

# To view the outputs
terraform -chdir=aws output

#To view what was deployed:
terraform -chdir=aws show
```

#### Test AWS Instance:

```sh
export HOST=`terraform -chdir=aws output -raw public_ip`
export PRIVATE_KEY=`terraform -chdir=aws output -raw private_key_path`

ssh -o StrictHostKeyChecking=no -i $PRIVATE_KEY ubuntu@$HOST
docker ps
which docker-compose
```

#### About Solr Index

The stage.yaml installs the index under {{ stage_dir }}/srv-solr-data/index.
In vars.yaml, set CREATE_INDEX and change the appropriate variables.

##### Production:  Download index ...
  - CREATE_INDEX=False
  - golr_index_archive_url
  - golr_timestamp
  - release_archive_doi

##### Development: Create Index ...
  - CREATE_INDEX=True
  - GOLR_SOLR_MEMORY
  - GOLR_LOADER_MEMORY
  - GOLR_INPUT_ONTOLOGIES
  - GOLR_INPUT_GAFS

#### LogRotate To AWS S3
  - USE_S3: 1
  - S3_CRED_FILE: REPLACE_ME
  - S3_BUCKET: REPLACE_ME

Format of S3_CRED_FILE:

```
[default]
access_key = REPLACE_ME
secret_key = REPLACE_ME
```

#### Stage To AWS Instance:

Clone the repo on the AWS instance, build the docker image and finally copy the docker-compose file
and other templates.

```sh
cd provision
export HOST=`terraform -chdir=aws output -raw public_ip`
export PRIVATE_KEY=`terraform -chdir=aws output -raw private_key_path`

// Make sure this is an abosulte path.
export STAGE_DIR=/home/ubuntu/stage_dir

// Using this repo and master branch
ansible-playbook -e "stage_dir=$STAGE_DIR" -u ubuntu -i "$HOST," --private-key $PRIVATE_KEY build_images.yaml
ansible-playbook -e "stage_dir=$STAGE_DIR" -u ubuntu -i "$HOST," --private-key $PRIVATE_KEY stage.yaml
ansible-playbook -e "stage_dir=$STAGE_DIR" -u ubuntu -i "$HOST," --private-key $PRIVATE_KEY start_services.yaml

// Or to specify a forked repo and different branch ...
ansible-playbook -e "stage_dir=$STAGE_DIR" -e "repo=https://github.com/..." -e "branch=..." -u ubuntu -i "$HOST," --private-key $PRIVATE_KEY build_images.yaml
ansible-playbook -e "stage_dir=$STAGE_DIR" -e "repo=https://github.com/..." -e "branch=..." -u ubuntu -i "$HOST," --private-key $PRIVATE_KEY stage.yaml
ansible-playbook -e "stage_dir=$STAGE_DIR" -e "repo=https://github.com/..." -e "branch=..." -u ubuntu -i "$HOST," --private-key $PRIVATE_KEY start_services.yaml
```

#### Start Docker Containers:

Start Containers and access amigo using the browser at http://{{ AMIGO_DYNAMIC }}/amigo

```
ssh -o StrictHostKeyChecking=no -i $PRIVATE_KEY ubuntu@$HOST
// cd to stage_dir ....
docker-compose -f docker-compose.yaml up -d

// Tail logs, bring down, delete containers
docker-compose -f docker-compose.yaml logs -f
docker-compose -f docker-compose.yaml down
```

#### Accessing Containers

```sh
// Amigo
docker exec -it amigo /bin/bash

// Proxy
docker exec -it apache_amigo /bin/bash
```

#### Destroy AWS instance:

Destroy when done.

Note: The terraform state is stored in the directory aws.
      Do not lose it or delete it

```
terraform -chdir=aws destroy
```

#### Force Reinstall

During Development one can remove the `amigo_hash` file to force the reinstall of the amigo perl software.
You would need to restart the amigo container.

#### Test LogRotate

Test LogRotate. Use -f option to force log rotation.

```sh
docker exec -it apache_amigo bash
ps -ef | grep cron
ps -ef | grep apache2
cat /opt/credentials/s3cfg
logrotate -v -f /etc/logrotate.d/apache2
```

#### Monit and GOlr

The monit process monitor is within the "golr" container and produces an event log within that container at `/var/log/monit.log`.
