<?php

declare(strict_types=1);

namespace OCA\Eurooffice\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Auto-generated migration step: Please modify to your needs!
 */
class Version070400Date20220929111111 extends SimpleMigrationStep {

    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     */
    public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
    }

    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('eurooffice_filekey')) {
            $table = $schema->createTable('eurooffice_filekey');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('file_id', 'bigint', [
                'notnull' => false,
                'default' => '-1',
            ]);
            $table->addColumn('key', 'string', [
                'notnull' => true,
                'length' => 128,
            ]);
            $table->addColumn('lock', 'integer', [
                'notnull' => true,
                'default' => 0,
            ]);
            $table->addColumn('fs', 'integer', [
                'notnull' => true,
                'default' => 0,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['file_id'], 'eo_filekey_file_id');
        }

        if (!$schema->hasTable('eurooffice_permissions')) {
            $table = $schema->createTable('eurooffice_permissions');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('share_id', 'bigint', [
                'notnull' => true,
                'default' => '-1',
            ]);
            $table->addColumn('permissions', 'integer', [
                'notnull' => true,
                'default' => 0,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['share_id'], 'eo_permissions_share_id');
        }

        if (!$schema->hasTable('eurooffice_instance')) {
            $table = $schema->createTable('eurooffice_instance');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('remote', 'string', [
                'notnull' => true,
                'length' => 128,
            ]);
            $table->addColumn('expire', 'bigint', [
                'notnull' => true,
                'default' => 0,
            ]);
            $table->addColumn('status', 'integer', [
                'notnull' => true,
                'default' => 0,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['remote'], 'eo_instance_remote');
        }

        return $schema;
    }

    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     */
    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
    }
}
