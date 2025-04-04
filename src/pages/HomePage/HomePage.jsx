import React, { useState, useEffect, useContext } from 'react';
import {
  Button, Typography, Layout, Modal, Form, Input, Select, DatePicker, message, Badge, List, Tag, Space, Spin, Row, Col, Card, Progress, Tabs, Popconfirm, notification
} from 'antd';
import {
  PlusCircleOutlined, ClockCircleOutlined, CheckCircleOutlined, PauseCircleOutlined, EyeOutlined, FireOutlined, FlagOutlined, CalendarOutlined, UnorderedListOutlined, DeleteOutlined
} from '@ant-design/icons';
import { taskService } from '../../services/taskService';
import { authService } from '../../services/authService';
import moment from 'moment';
import FooterLayout from '../../layouts/FooterLayout';
import NavbarLayout from '../../layouts/NavbarLayout';

const { Content } = Layout;
const { Title, Text } = Typography;
const { TabPane } = Tabs;

const HomePage = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedTask, setSelectedTask] = useState(null);
  const [form] = Form.useForm();
  const { user, logoutUser } = useContext(authService);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error("No autenticado");
        }

        const tasksData = await taskService.getTasks();
        setTasks(tasksData);

      } catch (error) {
        console.error("Error al obtener tareas:", error);
        if (error.message.includes("401") || error.message.includes("autenticación")) {
          message.error("Sesión expirada. Por favor, vuelve a iniciar sesión");
          logoutUser();
        } else {
          message.error(`Error: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchTasks();
    }
  }, [user, logoutUser]);

  const showModal = () => {
    if (!user) {
      message.warning("Debes iniciar sesión para crear tareas");
      return;
    }
    form.resetFields();
    setIsModalVisible(true);
  };

  useEffect(() => {
    if (!user) return;

    let cleanupSSE;

    const initializeReminders = async () => {
      try {
        // 1. Verificar si hay recordatorios activos primero
        const activeReminders = await taskService.checkForActiveReminders();

        // 2. Mostrar notificaciones pendientes
        activeReminders.forEach(reminder => {
          showReminderNotification(reminder);
        });

        // 3. Configurar SSE solo si hay recordatorios activos o próximos
        if (activeReminders.length > 0 ||
          tasks.some(t => t.remind_me && moment(t.remind_me).isAfter(moment()))) {
          cleanupSSE = await taskService.setupSSEConnection(showReminderNotification);
        }
      } catch (error) {
        console.error('Error initializing reminders:', error);
      }
    };

    const showReminderNotification = (reminderData) => {
      notification.info({
        message: 'Recordatorio',
        description: (
          <div>
            <p>{reminderData.message}</p>
            <p>Hora: {moment(reminderData.reminderTime).format('DD/MM/YYYY HH:mm')}</p>
            <Button
              type="primary"
              size="small"
              onClick={() => {
                const task = tasks.find(t => t._id === reminderData.taskId);
                if (task) setSelectedTask(task);
                notification.close(reminderData.taskId);
              }}
            >
              Ver Tarea
            </Button>
          </div>
        ),
        key: reminderData.taskId,
        duration: 0,
        placement: 'bottomRight'
      });
    };

    initializeReminders();

    return () => {
      if (cleanupSSE) cleanupSSE();
    };
  }, [user, tasks]);

  const handleCancel = () => setIsModalVisible(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const formattedValues = {
        ...values,
        dead_line: values.dead_line.toISOString(),
        remind_me: values.remind_me?.toISOString(),
        createdBy: user._id
      };

      const data = await taskService.createTask(formattedValues);
      const newTask = {
        ...data.task,
        dead_line: moment(data.task.dead_line),
        remind_me: data.task.remind_me ? moment(data.task.remind_me) : null
      };

      setTasks([...tasks, newTask]);
      message.success("Tarea creada exitosamente");
      setIsModalVisible(false);
    } catch (error) {
      console.error("Error al guardar la tarea:", error);
      if (error.message.includes("401")) {
        message.error("Sesión expirada. Por favor, vuelve a iniciar sesión");
        logoutUser();
      } else {
        message.error(error.message || "Error al crear la tarea");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      setLoading(true);
      // Actualizar primero el estado local para una respuesta más rápida
      const updatedTasks = tasks.map(t =>
        t._id === taskId ? { ...t, status: newStatus } : t
      );
      setTasks(updatedTasks);

      // Luego hacer la llamada al API
      await taskService.updateTaskStatus(taskId, newStatus);

      message.success("Estado de tarea actualizado");
    } catch (error) {
      console.error("Error al actualizar estado de la tarea:", error);

      // Revertir el cambio si falla
      const originalTasks = tasks.map(t =>
        t._id === taskId ? { ...t, status: t.status } : t
      );
      setTasks(originalTasks);

      if (error.message.includes("401")) {
        message.error("Sesión expirada. Por favor, vuelve a iniciar sesión");
        logoutUser();
      } else {
        message.error("Error al actualizar el estado");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await taskService.deleteTask(taskId);
      const updatedTasks = tasks.filter(t => t._id !== taskId);
      setTasks(updatedTasks);
  
      if (selectedTask?._id === taskId) {
        setSelectedTask(null);
      }
      message.success("Tarea eliminada");
    } catch (error) {
      console.error("Error al eliminar:", error);
      message.error("No se pudo eliminar la tarea");
    }
  };

  const statusData = {
    "In Progress": { color: "gold", icon: <ClockCircleOutlined />, text: "En Progreso" },
    "Revision": { color: "blue", icon: <EyeOutlined />, text: "En Revisión" },
    "Paused": { color: "red", icon: <PauseCircleOutlined />, text: "Pausada" },
    "Done": { color: "green", icon: <CheckCircleOutlined />, text: "Finalizada" }
  };

  const getPriorityColor = (deadline) => {
    if (!deadline) return 'gray';
    const daysLeft = moment(deadline).diff(moment(), 'days');
    if (daysLeft < 0) return 'red';
    if (daysLeft <= 2) return 'orange';
    if (daysLeft <= 5) return 'yellow';
    return 'green';
  };

  const getPriorityLevel = (deadline) => {
    if (!deadline) return 0;
    const daysLeft = moment(deadline).diff(moment(), 'days');
    if (daysLeft < 0) return 4; // Urgente (vencida)
    if (daysLeft <= 2) return 3; // Alta
    if (daysLeft <= 5) return 2; // Media
    return 1; // Baja
  };

  const filteredTasks = isSearching
    ? searchResults
    : tasks.filter(task => {
      if (task.createdBy !== user?._id) return false;

      switch (activeTab) {
        case 'active':
          return task.status !== 'Done';
        case 'completed':
          return task.status === 'Done';
        case 'urgent':
          return getPriorityLevel(task.dead_line) >= 3 && task.status !== 'Done';
        default:
          return true;
      }
    });

  const taskStats = {
    total: tasks.filter(t => t.createdBy === user?._id).length,
    completed: tasks.filter(t => t.createdBy === user?._id && t.status === 'Done').length,
    urgent: tasks.filter(t =>
      t.createdBy === user?._id &&
      t.status !== 'Done' &&
      getPriorityLevel(t.dead_line) >= 3
    ).length,
  };

  return (
    <NavbarLayout>
      <FooterLayout selectedTask={selectedTask}>
        <Content style={{ padding: '24px', backgroundColor: '#f0f2f5' }}>
          <Row gutter={[24, 24]}>
            <Col span={24}>
              <Card>
                <Row justify="space-between" align="middle">
                  <Col>
                    <Title level={3} style={{ margin: 0 }}>
                      {user ? `Hola, ${user.username}` : 'RemaindMe'}
                    </Title>
                    <Text type="secondary">
                      {user ? `Tienes ${filteredTasks.length} tareas ${activeTab === 'active' ? 'pendientes' : activeTab === 'completed' ? 'completadas' : 'urgentes'}` : 'Inicia sesión para ver tus tareas'}
                    </Text>
                  </Col>
                  <Col>
                    <Button
                      type="primary"
                      icon={<PlusCircleOutlined />}
                      onClick={showModal}
                    >
                      Nueva Tarea
                    </Button>
                    <Button
                      type="primary"
                      icon={<FireOutlined />}
                      onClick={() => {
                        notification.info({
                          message: 'Recordatorio de Prueba',
                          description: (
                            <div>
                              <p>Esta es una notificación de prueba para verificar el funcionamiento</p>
                              <p>Hora: {moment().format('DD/MM/YYYY HH:mm')}</p>
                              <Button
                                type="primary"
                                size="small"
                                onClick={() => {
                                  notification.destroy();
                                  setSelectedTask(tasks[0]); // Selecciona la primera tarea como ejemplo
                                }}
                              >
                                Ver Tarea de Ejemplo
                              </Button>
                            </div>
                          ),
                          key: 'test-notification',
                          duration: 0, // No se cierra automáticamente
                          placement: 'bottomRight'
                        });
                      }}
                    >
                      Probar Notificación
                    </Button>
                  </Col>
                </Row>
              </Card>
            </Col>

            <Col span={24}>
              <Row gutter={[24, 24]}>
                <Col xs={24} sm={8}>
                  <Card>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Text strong>Total de tareas</Text>
                      <Progress
                        percent={taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0}
                        status={taskStats.completed === taskStats.total && taskStats.total > 0 ? 'success' : 'active'}
                      />
                      <Row justify="space-between">
                        <Col>
                          <Tag color="green">{taskStats.completed} completadas</Tag>
                        </Col>
                        <Col>
                          <Tag color="blue">{taskStats.total} total</Tag>
                        </Col>
                      </Row>
                    </Space>
                  </Card>
                </Col>

                <Col xs={24} sm={8}>
                  <Card>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Text strong>Tareas urgentes</Text>
                      <Progress
                        percent={taskStats.urgent > 0 ? 100 : 0}
                        status={taskStats.urgent > 0 ? 'exception' : 'success'}
                        format={() => taskStats.urgent}
                      />
                      <Text type="secondary">
                        {taskStats.urgent > 0
                          ? `${taskStats.urgent} tareas con alta prioridad`
                          : 'No hay tareas urgentes'}
                      </Text>
                    </Space>
                  </Card>
                </Col>

                <Col xs={24} sm={8}>
                  <Card>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Text strong>Próximas fechas</Text>
                      {tasks
                        .filter(t =>
                          t.createdBy === user?._id &&
                          t.dead_line &&
                          !t.dead_line.isBefore(moment()) &&
                          t.status !== "Done" // ✅ Excluir tareas finalizadas
                        )
                        .sort((a, b) => a.dead_line - b.dead_line)
                        .slice(0, 2)
                        .map(task => (
                          <div key={task._id}>
                            <Text ellipsis style={{ display: 'block' }}>
                              <CalendarOutlined style={{ marginRight: 8 }} />
                              {moment(task.dead_line).format('DD/MM')} - {task.nametask}
                            </Text>
                          </div>
                        ))}
                      {tasks.filter(t =>
                        t.createdBy === user?._id &&
                        t.dead_line &&
                        !t.dead_line.isBefore(moment()) &&
                        t.status !== "Done"
                      ).length === 0 && (
                          <Text type="secondary">No hay fechas próximas</Text>
                        )}
                    </Space>
                  </Card>
                </Col>
              </Row>
            </Col>

            <Col span={24}>
              <Card>
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  tabBarExtraContent={
                    <Text strong style={{ marginRight: 16 }}>
                      Mostrando {filteredTasks.length} tareas
                    </Text>
                  }
                >
                  <TabPane
                    tab={
                      <span>
                        <UnorderedListOutlined />
                        Activas
                      </span>
                    }
                    key="active"
                  />
                  <TabPane
                    tab={
                      <span>
                        <CheckCircleOutlined />
                        Completadas
                      </span>
                    }
                    key="completed"
                  />
                  <TabPane
                    tab={
                      <span>
                        <FireOutlined />
                        Urgentes
                      </span>
                    }
                    key="urgent"
                  />
                </Tabs>

                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                    <Spin size="large" />
                  </div>
                ) : (
                  <List
                    itemLayout="vertical"
                    dataSource={filteredTasks}
                    renderItem={task => (
                      <List.Item
                        style={{
                          padding: '16px',
                          borderLeft: `4px solid ${statusData[task.status]?.color || 'gray'}`,
                          marginBottom: '16px',
                          borderRadius: '4px',
                          backgroundColor: '#fff',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          ':hover': {
                            boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                          }
                        }}
                        onClick={() => setSelectedTask(task)}
                        actions={[
                          <Select
                            value={task.status}  // Cambiado de defaultValue a value
                            style={{ width: 140 }}
                            onChange={(value) => handleStatusChange(task._id, value)}
                            disabled={loading}
                          >
                            {Object.entries(statusData).map(([statusKey, statusInfo]) => (
                              <Select.Option key={statusKey} value={statusKey}>
                                <Space>
                                  {statusInfo.icon}
                                  {statusInfo.text}
                                </Space>
                              </Select.Option>
                            ))}
                          </Select>,
                          <Popconfirm
                            title="¿Estás seguro de eliminar esta tarea?"
                            onConfirm={() => handleDeleteTask(task._id)}
                            okText="Sí"
                            cancelText="No"
                          >
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Eliminar
                            </Button>
                          </Popconfirm>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            <Badge
                              color={statusData[task.status]?.color || 'gray'}
                              icon={statusData[task.status]?.icon}
                              style={{ marginTop: 6 }}
                            />
                          }
                          title={
                            <Text
                              strong
                              style={{
                                fontSize: '16px',
                                color: statusData[task.status]?.color || 'inherit'
                              }}
                            >
                              {task.nametask}
                            </Text>
                          }
                          description={
                            <Space direction="vertical" size={4}>
                              <Text type="secondary" style={{ fontSize: '14px' }}>
                                {task.description}
                              </Text>
                              <Space size={8}>
                                <Tag icon={<FlagOutlined />} color={getPriorityColor(task.dead_line)}>
                                  {task.dead_line ?
                                    `${moment(task.dead_line).fromNow()} (${moment(task.dead_line).format('DD/MM/YYYY')})` :
                                    'Sin fecha'}
                                </Tag>
                                <Tag color="geekblue">{task.category}</Tag>
                                {task.remind_me && (
                                  <Tag icon={<ClockCircleOutlined />} color="purple">
                                    Recordar: {moment(task.remind_me).format('DD/MM HH:mm')}
                                  </Tag>
                                )}
                              </Space>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          </Row>

          <Modal
            title="Crear Nueva Tarea"
            visible={isModalVisible}
            onCancel={handleCancel}
            onOk={handleOk}
            confirmLoading={loading}
            width={700}
            okText="Crear Tarea"
            cancelText="Cancelar"
          >
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="nametask"
                    label="Nombre"
                    rules={[{ required: true, message: "Nombre requerido" }]}
                  >
                    <Input placeholder="Nombre de la tarea" autoComplete='off' />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="category"
                    label="Categoría"
                    initialValue="Work"
                    rules={[{ required: true }]}
                  >
                    <Select>
                      <Select.Option value="Work">Trabajo</Select.Option>
                      <Select.Option value="Study">Estudio</Select.Option>
                      <Select.Option value="Personal">Personal</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="description"
                label="Descripción"
                rules={[{ required: true }]}
              >
                <Input.TextArea rows={3} placeholder="Descripción detallada" />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    help={form.getFieldValue('dead_line')
                      ? `El recordatorio debe ser antes de ${moment(form.getFieldValue('dead_line')).format('LLL')}`
                      : 'Selecciona primero la fecha límite'}
                    name="dead_line"
                    label="Fecha Límite"
                    rules={[{ required: true }]}
                  >

                    <DatePicker
                      showTime
                      format="YYYY-MM-DD HH:mm"
                      style={{ width: '100%' }}
                      disabledDate={(current) => current && current < moment().startOf('day')}
                      onChange={() => {
                        // Resetear el recordatorio si ya no es válido
                        const deadLine = form.getFieldValue('dead_line');
                        const remindMe = form.getFieldValue('remind_me');

                        if (remindMe && deadLine && moment(remindMe) > moment(deadLine)) {
                          form.setFieldsValue({ remind_me: null });
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="remind_me"
                    label="Recordatorio"
                    dependencies={['dead_line']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value) return Promise.resolve();
                          const deadLine = getFieldValue('dead_line');
                          if (deadLine && moment(value).isAfter(moment(deadLine))) {
                            return Promise.reject('El recordatorio debe ser antes de la fecha límite');
                          }
                          return Promise.resolve();
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      showTime
                      format="YYYY-MM-DD HH:mm"
                      style={{ width: '100%' }}
                      disabledDate={(current) => current && current < moment().startOf('day')}
                      disabledTime={(current) => {
                        if (!current) return {};
                        if (current.isSame(moment(), 'day')) {
                          const now = moment();
                          return {
                            disabledHours: () => Array.from({ length: 24 }, (_, i) => i)
                              .filter(hour => hour < now.hour()),
                            disabledMinutes: (selectedHour) => {
                              if (selectedHour === now.hour()) {
                                return Array.from({ length: 60 }, (_, i) => i)
                                  .filter(minute => minute < now.minute());
                              }
                              return [];
                            }
                          };
                        }
                        return {};
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="status"
                label="Estado"
                initialValue="In Progress"
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value="In Progress">En progreso</Select.Option>
                  <Select.Option value="Done">Finalizada</Select.Option>
                  <Select.Option value="Paused">Pausada</Select.Option>
                  <Select.Option value="Revision">En revisión</Select.Option>
                </Select>
              </Form.Item>
            </Form>
          </Modal>
        </Content>
      </FooterLayout>
    </NavbarLayout>
  );
};

export default HomePage;