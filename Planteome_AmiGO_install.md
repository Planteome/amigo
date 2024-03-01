# Planteome AmiGO install instructions

This document outlines the steps needed to move/copy the AmiGO install to a new server/location.

These instructions assume a RHEL/Rocky "dnf"/rpm OS. Packages and install instructions may differ slightly for Deb based systems.

## Install Apache and other packages

* Done as su or with sudo

    > dnf install httpd httpd-devel httpd-tools mod_ssl mod_perl

    > dnf install graphviz java-1.8.0-openjdk java-1.8.0-openjdk-devel

    > systemctl enable httpd

    > systemctl start httpd

    > dnf install npm

    > /usr/bin/npm config set prefix /usr/local

    > /usr/bin/npn install -g npm@6.10.0

    > npm install -g node@11.15.0


## Set up directories and files

* Done as regular user

    > sudo mkdir -p /data/www/planteome_dev/

    > cd /data/www/planteome_dev/

    > scp palea.cgrb.oregonstate.edu:/data/www/planteome_dev/amigo_base.tar.gz ./

    > tar zxvf amigo_base.tar.gz

    > truncate -s 0 amigo/log/*.log

    > sudo chown -R apache: log

    > scp palea.cgrb.oregonstate.edu:/etc/httpd/conf.d/planteome_dev.conf ./

    > scp palea.cgrb.oregonstate.edu:/etc/systemd/systemd/solr.service ./

    > sudo cp planteome_dev.conf /etc/httpd/conf.d/

    > sudo cp solr.service /etc/systemd/system/

    > sudo systemctl daemon-reload
    
    > sudo systemctl start solr

## Edit config files, install perl and node packages

* Done as regular user

    > cd /data/www/planteome_dev/amigo

    > vim conf/amigo.yaml
    
    edit file to use correct domain (if needed)

    > ./node_modules/.bin/gulp install

* as root

    > dnf install cpan

    * One of the cpan modules fails a test on RHEL systems and won't install without a force install
        * See https://bugzilla.redhat.com/show_bug.cgi?id=2243201

    > cpan -fi CGI::Application::Plugin::Session

    > cat /home/bpp/elserj/amigo_perl_cpan_packages.lst | xargs cpan

    > systemctl reload httpd


Check to make sure it is all working. Additional steps may be required for SSL certs, etc...
